# Server Gateway Channel

## Role

Manages server-side communication with physical gateway devices. Owns the HTTP HELLO and artifact download endpoints and WebSocket connections. Dispatches preflight checks and print jobs, caches printer capabilities, handles reconnection.

## Contract

### Type overview

| Type | Direction | Description | Methods / Events |
|---|---|---|---|
| `In_Req` | Router → Gateway channel | Router requests channel to act | RequestPreFlight, RequestPrint, GetPrinterCapabilities |
| `Out_Resp` | Gateway channel → Router | Channel responds to In_Req | ok/error envelope |
| `Out_Req` | Gateway channel → Router | Channel requests router to act | RequestDeviceDetails, ValidateArtifactToken |
| `In_Resp` | Router → Gateway channel | Router responds to Out_Req | device details, token validation result |
| `Out_Us` | Gateway channel → Router | Channel sends unsolicited event | GW_CHANNEL_READY, GW_CONNECTED, GW_DISCONNECTED, GW_ERROR, JOB_STATUS_UPDATE |

---

### Init

```ts
type GatewayDeps = {
  config: {
    httpPort: number;    // HTTP server port (HELLO + artifact download)
    wsPath: string;      // WebSocket path (e.g. /ws/gateway)
  };
  sendToRouter: (event: Out_Req | Out_Us) => Promise<In_Resp | void>;
  docStore: {
    getArtifactStream: (jobId: string) => Promise<{ stream: Readable; contentType: string; contentLength?: number } | null>;
  };
};

type GatewayChannel = {
  execute(req: In_Req): Promise<Out_Resp>;
  stop(): Promise<void>;
};
```

### `In_Req` (Router → Gateway Channel)

| Method | Args | Description |
|---|---|---|
| `RequestPreFlight` | `{ deviceId, jobId, documents[] }` | Send PRINT_PREFLIGHT to gateway, wait for response. Returns `ok: true` if can fulfill, `ok: false` with reason if rejected |
| `RequestPrint` | `{ deviceId, jobId, artifactUrl, authToken, documents[] }` | Send PRINT_JOB to gateway, wait for JOB_ACCEPTED. Returns `ok: true` on acceptance |
| `GetPrinterCapabilities` | `{ deviceId }` | Return cached printer capabilities (from last CAPABILITY_INFO) |

---

### `Out_Req` (Gateway Channel → Router)

| Method | Args | Description |
|---|---|---|
| `RequestDeviceDetails` | `{ deviceId }` | HTTP HELLO received — router returns device lifecycle state + token |
| `ValidateArtifactToken` | `{ jobId, authToken }` | Gateway requests artifact — router validates job-specific token |

---

### `Out_Us` (Gateway Channel → Router)

| Event | Payload | Description |
|---|---|---|
| `GW_CHANNEL_READY` | `{ wsPort }` | Channel initialized and listening |
| `GW_CONNECTED` | `{ deviceId }` | Gateway WebSocket established |
| `GW_DISCONNECTED` | `{ deviceId }` | Gateway WebSocket lost |
| `GW_ERROR` | `{ deviceId, error }` | Gateway communication error |
| `JOB_STATUS_UPDATE` | `{ deviceId, jobId, status, reason? }` | Gateway reported async job status (QUEUED / PRINTING / COMPLETED / FAILED) |

---

## Gateway ↔ Server Wire Protocol

### Transport

| Phase | Transport | Direction | Port |
|---|---|---|---|
| Bootstrap | HTTP | Gateway → Server | 443 (same as server) |
| Persistent | WebSocket (WSS) | Gateway → Server (outbound) | 443 |

### HTTP endpoint

```
POST /api/gateway/hello
Content-Type: application/json
```

**Request:**
```json
{
  "deviceId": "550e8400-e29b-41d4-a716-446655440000",
  "softwareVersion": "0.1.0"
}
```

**Response (PRE_ACTIVATION):**
```json
{
  "state": "PRE_ACTIVATION",
  "retryAfter": 60
}
```

**Response (ACTIVATED):**
```json
{
  "state": "ACTIVATED",
  "deviceToken": "tok-abc-123",
  "retryAfter": 30
}
```

**Response (OPERATIONAL):**
```json
{
  "state": "OPERATIONAL",
  "deviceToken": "tok-abc-123",
  "shopName": "Main St Print Shop",
  "pendingJobIds": ["JOB-001"]
}
```

### HELLO retry logic

```
PRE_ACTIVATION → wait retryAfter seconds → HELLO again
ACTIVATED      → wait retryAfter seconds → HELLO again (expecting OPERATIONAL)
OPERATIONAL    → open WebSocket immediately
```

### WebSocket endpoint

```
wss://<server>/ws/gateway?deviceId=<id>&token=<token>
```

Server validates `deviceToken` before accepting. Once connected:

| Direction | Message | Payload | Description |
|---|---|---|---|
| Gateway → Server | `HEARTBEAT` | `{ ts }` | Every 30s |
| Gateway → Server | `CAPABILITY_INFO` | `{ printers: [...] }` | Printer list + capabilities |
| Server → Gateway | `PRINT_PREFLIGHT` | `{ jobId, requirements }` | Pre-flight check |
| Gateway → Server | `PRINT_PREFLIGHT_RESPONSE` | `{ jobId, canFulfill, reason? }` | Accept/reject |
| Server → Gateway | `PRINT_JOB` | `{ jobId, artifactUrl, authToken, requirements }` | Authorized job |
| Gateway → Server | `JOB_ACCEPTED` | `{ jobId }` | Gateway takes responsibility |
| Gateway → Server | `JOB_STATUS` | `{ jobId, status, reason? }` | QUEUED / PRINTING / COMPLETED / FAILED |

### Message format

All WebSocket messages are JSON with this envelope:

```json
{
  "type": "HEARTBEAT",
  "payload": { "ts": "2026-09-12T10:00:00Z" },
  "timestamp": "2026-09-12T10:00:00Z"
}
```

### Per-document requirements in PREFLIGHT

```json
{
  "type": "PRINT_PREFLIGHT",
  "payload": {
    "jobId": "JOB-001",
    "documents": [
      { "pageCount": 4, "color": false, "duplex": true, "paperSize": "A4", "copies": 2 },
      { "pageCount": 2, "color": true, "duplex": false, "paperSize": "A4", "copies": 1 }
    ]
  }
}
```

### Artifact download

```
GET /api/gateway/jobs/{jobId}/artifact
Authorization: Bearer <job-specific-token>
```

Server streams the merged print-ready PDF. The token is short-lived and specific to the job, validated via `Out_Req.ValidateArtifactToken`. The file is streamed from doc store — no full buffering in RAM.

## Dependencies

- **HTTP server** (started by channel — serves HELLO + artifact download)
- **WebSocket server** (started by channel, upgrade callback passed to HTTP server)
- **Router** (via `sendToRouter` — for device state lookup, token validation, JOB_STATUS forwarding)
- **Doc Store** (via `docStore.getArtifactStream` — for artifact download)

## State Machines

This channel does not execute state machines. It observes gateway lifecycle state (PRE_ACTIVATION → ACTIVATED → OPERATIONAL) stored by Data DB channel. It detects disconnection/reconnection and publishes `GW_CONNECTED` / `GW_DISCONNECTED` events.

## Tests

`channel-tests/gateway/` (to be created).