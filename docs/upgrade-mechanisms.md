# Upgrade & Migration Mechanisms

## 1. Protocol Versioning

The server-gateway wire protocol uses explicit versioning to enable safe upgrades.
Gateways declare their protocol version in HELLO. Server stores it per-gateway.

### HELLO Payload

```json
{
  "deviceId": "550e8400-e29b-41d4-a716-446655440000",
  "softwareVersion": "0.1.0",
  "protocolVersion": 1
}
```

### Server Response

```json
{
  "state": "OPERATIONAL",
  "deviceToken": "tok-abc-123",
  "protocolVersion": 1,
  "firmwareUrl": "https://server/firmware/v2.tar.gz",
  "firmwareChecksum": "sha256:abc123..."
}
```

`firmwareUrl` + `firmwareChecksum` present only when a newer protocol version is available.
Gateway decides when to upgrade — server never pushes.

### Version Negotiation

```
Gateway(protocol=1) → HELLO → Server
  Server: "I support up to v2. You are v1. Upgrade available at firmwareUrl."
  Gateway: Continue on v1 OR upgrade at next idle window.

Gateway(protocol=2) → HELLO → Server
  Server: "I support up to v2. You are v2. All good."
```

Server must handle both v1 and v2 connections during transition. Implementation:
- Per-connection `protocolVersion` stored in connection map
- WS message serialization/deserialization dispatched by version
- Gateway queued / in-flight jobs continue on their original protocol version

---

## 2. Gateway Upgrade (Stop-Download-Restart)

### Rationale

Prefer process restart over runtime code injection:
- Process isolation prevents corrupted state
- Simple download + exec, no `dlopen`/`eval`/module cache manipulation
- Works for any runtime (Node.js, Go, Rust, Python)
- Old binary stays on disk for rollback

### Protocol Drain + Upgrade Sequence

```
Time ────────────────────────────────────────────────────────►

Gateway (v1)                                             Server
   │                                                         │
   │  HELLO → { protocolVersion: 1 }                        │
   │←───────────────────────────────────────────────────────│
   │                                                         │
   │  Normal operation (v1)                                  │
   │  PRINT_JOB, JOB_ACCEPTED, JOB_STATUS, ...               │
   │                                                         │
   │  HELLO → { protocolVersion: 1, ... }                    │
   │←───────────────────────────────────────────────────────│
   │                                                         │
   │  Response: protocolVersion: 2, firmwareUrl: "..."       │
   │                                                         │
   │  ┌─ Drain phase ────────────────────────────┐           │
   │  │  Finish all PRINTING jobs (wait per job) │           │
   │  │  Process all QUEUED jobs until idle      │           │
   │  └──────────────────────────────────────────┘           │
   │                                                         │
   │  HEARTBEAT (idle — no active jobs)                      │
   │───────────────────────────────────────────────────────→│
   │                                                         │
   │  ┌─ Download phase ─────────────────────────┐           │
   │  │  Fetch firmware artifact from firmwareUrl│           │
   │  │  Verify checksum (SHA256)                │           │
   │  │  Write to staging partition              │           │
   │  │  Set boot flag to staging                │           │
   │  └──────────────────────────────────────────┘           │
   │                                                         │
   │  ┌─ Restart phase ──────────────────────────┐           │
   │  │  Stop process (exit)                      │           │
   │  │  Systemd / supervisor restarts            │           │
   │  │  New binary loads v2 handler             │           │
   │  └──────────────────────────────────────────┘           │
   │                                                         │
   │  HELLO → { protocolVersion: 2 }                        │
   │───────────────────────────────────────────────────────→│
   │                                                         │
   │  Response: OPERATIONAL, protocolVersion: 2              │
   │←───────────────────────────────────────────────────────│
   │                                                         │
   │  Normal operation (v2)                                  │
```

### Expected Downtime

| Step | Duration (Pi Zero 2 W) |
|---|---|
| Download firmware (~5 MB) | 2-5s |
| Verify checksum | <1s |
| Stop process | ~100ms |
| Start new binary (JS parse + init) | 2-4s |
| HELLO + WS connect | ~500ms |
| **Total** | **~5-10s** |

Acceptable for a print gateway — print jobs take minutes per page, a 10s window
is unnoticeable.

### Reliable Boot Design

Use A/B staging partitions to prevent bricking:

```
Storage
├── /boot/active → symlink to A or B
├── /firmware/A/
│   ├── v1.0.0/       ← current running version
│   └── v1.0.1/       ← prev version (fallback)
└── /firmware/B/
    └── v2.0.0/       ← staging (downloaded, not yet active)
```

Boot sequence:
1. Load `/boot/active`
2. Increment boot counter in metadata
3. Run health check within 30s
4. On success: reset boot counter
5. On failure (3 consecutive boots, counter >= 3): swap symlink to previous version, reboot

### Server-side Handling During Upgrade

- Server includes `firmwareUrl` in HELLO response when upgrade available
- Server expects gateway may disconnect after receiving upgrade instruction
- Gateway disconnect during upgrade window is expected, not alarming
- Server suppresses `GW_DISCONNECTED` alerts for known-upgrading gateways
- On reconnect, server verifies gateway protocol version

---

## 3. Server Upgrade (Multi-Instance Rolling Deploy)

### Architecture

```
Load balancer (nginx / HAProxy)
  ├── Server A (v1)     ← connections draining
  ├── Server B (v2)     ← accepting new
  └── Server C (v2)     ← accepting new
```

### Upgrade Sequence

```
Step 1: Deploy v2 to one server instance (B)

Step 2: Drain A from load balancer
  - Stop directing new HTTP requests to A
  - Existing WS connections on A remain active

Step 3: Upgrade A to v2
  - SIGTERM → A closes WS connections gracefully
  - Gateways on A see WS close → reconnect
  - Reconnect HELLO → lands on B or C (v2)
  - Protocol negotiation resolves any mismatch

Step 4: Return A to load balancer

Step 5: Repeat for remaining instances
```

### Key Properties

- **No total downtime.** At least one instance serving at all times
- **Per-gateway disruption:** ~1-2s (WS reconnect + HELLO + re-establish)
- **Existing PRINTING jobs:** unaffected — gateway holds job state locally
- **AUTHORIZED jobs that never got dispatched:** server re-dispatches on reconnect
- **Version coexistence:** v1 and v2 instances behind same load balancer during rollout

### Gateway Reconnect on Server Restart

```
Server A receiving SIGTERM:
1. Stop accepting new connections
2. Send WS close frame to each connected gateway
3. Exit

Gateway:
1. WS onclose fires → detect disconnect
2. Enter reconnect loop
3. HELLO to load balancer → lands on Server B
4. Server B stores gateway under deviceId (deviceToConn)
5. Server re-dispatches any pending AUTHORIZED jobs
6. Printer continues PRINTING job (gateway has it locally)
7. Normal operation resumes
```

### Orchestration (v1)

For v1, a simple approach suffices:

```sh
# systemd service reload
systemctl reload printnath-server

# Or Node.js cluster mode
kill -s SIGUSR2 <master-pid>

# Or Docker
docker compose up -d --no-deps server
```

Multi-instance orchestration with proper health-check draining can wait until v2.

---

## 4. Implementation Checklist (Before Production)

- [ ] Add `protocolVersion` field to HELLO request
- [ ] Add `protocolVersion` + `firmwareUrl` to HELLO response
- [ ] Store protocol version per connection in gateway channel
- [ ] Map WS message types to versioned serializers
- [ ] Gateway: A/B partition layout for safe firmware swap
- [ ] Gateway: boot counter + rollback on N consecutive failures
- [ ] Gateway: drain loop (wait for idle before upgrade)
- [ ] Server: suppress alert for upgrading gateways
- [ ] Server: rolling restart with graceful WS close
- [ ] End-to-end test: gateway v1 → server v2 → upgrade → gateway v2