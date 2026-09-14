# Server Gateway Channel

## Role

Manages server-side communication with physical gateway devices. Owns the HTTP HELLO endpoint and WebSocket connections. Dispatches print jobs, queries capabilities, handles reconnection.

## Contract

### Type overview

| Type | Direction | Description | Methods |
|---|---|---|---|
| `In_Req` | Router → Gateway channel | Router requests channel to act | dispatchPrintJob, dispatchPreflight, cancelJob, getConnectionStatus |
| `Out_Req` | Gateway channel → Router | Channel requests router to act | gatewayHello, jobStatusUpdate, capabilityReport |
| `Out_Us` | Gateway channel → Router | Channel sends unsolicited event | GW_CONNECTED, GW_DISCONNECTED, GW_CHANNEL_READY, GW_ERROR |
| `Out_Resp` | Gateway channel → Router | Channel responds to In_Req | ok/error envelope |

---

### Init

```ts
type GatewayDeps = {
  config: {
    wsPort: number;           // WebSocket server port
    heartbeatTimeoutMs: number; // disconnect if no heartbeat within this
  };
  sendToRouter: (event: GatewayOut_Req | GatewayOut_Pub) => Promise<void>;
  dataDb: {
    execute: (req: DataDbIn_Req) => Promise<DataDbOut_Resp>;
  };
};

type GatewayChannel = {
  execute(req: GatewayIn_Req): Promise<GatewayOut_Resp>;
  stop(): Promise<void>;
};
```

### `In_Req` (Router → Gateway Channel)

| Method | Args | Description |
|---|---|---|
| `dispatchPrintJob` | `{ deviceId, jobId, artifactUrl, authToken, requirements[] }` | Send PRINT_JOB to gateway |
| `dispatchPreflight` | `{ deviceId, jobId, requirements[] }` | Send PRINT_PREFLIGHT to gateway |
| `cancelJob` | `{ deviceId, jobId, reason }` | Send CANCEL_JOB to gateway |
| `getConnectionStatus` | `{ deviceId }` | Check if gateway connected |
| `ping` | `{}` | Health check |
| `stop` | `{}` | Shutdown |

---

### `Out_Req` (Gateway Channel → Router)

| Method | Args | Description |
|---|---|---|
| `gatewayHello` | `{ deviceId, softwareVersion, remoteAddr }` | Gateway sent HELLO, router should update state |
| `jobStatusUpdate` | `{ deviceId, jobId, status, reason? }` | Gateway reported JOB_STATUS, router should update DB |
| `capabilityReport` | `{ deviceId, printers }` | Gateway sent CAPABILITY_RESPONSE, router should store |

---

### `Out_Us` (Gateway Channel → Router)

| Event | Payload | Description |
|---|---|---|
| `GW_CHANNEL_READY` | `{ wsPort }` | Channel initialized and listening |
| `GW_CONNECTED` | `{ deviceId }` | Gateway WebSocket established |
| `GW_DISCONNECTED` | `{ deviceId }` | Gateway WebSocket lost |
| `GW_ERROR` | `{ deviceId, error }` | Gateway communication error |

---

### Incoming requests (Router → Gateway Channel)

| Method | Args | Description |
|---|---|---|
| `dispatchPrintJob` | `{ deviceId, jobId, artifactUrl, authToken, requirements }` | Send PRINT_JOB to gateway |
| `dispatchPreflight` | `{ deviceId, jobId, requirements[] }` | Send PRINT_PREFLIGHT to gateway |
| `cancelJob` | `{ deviceId, jobId, reason }` | Send CANCEL_JOB to gateway |
| `getConnectionStatus` | `{ deviceId }` | Check if gateway is connected |
| `ping` | `{}` | Health check |
| `stop` | `{}` | Shutdown WS server |

### Outgoing requests (Gateway Channel → Router)

These are requests the gateway channel makes to the router (which forwards to other channels).

```ts
type GatewayOut_Req =
  | { method: 'gatewayHello'; args: { deviceId: string; softwareVersion: string; remoteAddr: string } }
  | { method: 'jobStatusUpdate'; args: { deviceId: string; jobId: string; status: string; reason?: string } }
  | { method: 'capabilityReport'; args: { deviceId: string; printers: PrinterInfo[] } };
```

### Publications (Gateway Channel → Router)

Unsolicited events from gateways.

```ts
type GatewayOut_Pub =
  | { event: 'GW_CHANNEL_READY'; payload: { wsPort: number } }
  | { event: 'GW_CONNECTED'; payload: { deviceId: string } }
  | { event: 'GW_DISCONNECTED'; payload: { deviceId: string } }
  | { event: 'GW_ERROR'; payload: { deviceId: string; error: string } };
```

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
| Server → Gateway | `CAPABILITY_QUERY` | `{}` | After WS established |
| Gateway → Server | `CAPABILITY_RESPONSE` | `{ printers: [...] }` | Printer list + capabilities |
| Server → Gateway | `PRINT_PREFLIGHT` | `{ jobId, requirements }` | Pre-flight check |
| Gateway → Server | `PRINT_PREFLIGHT_RESPONSE` | `{ jobId, canFulfill, reason? }` | Accept/reject |
| Server → Gateway | `PRINT_JOB` | `{ jobId, artifactUrl, authToken, requirements }` | Authorized job |
| Gateway → Server | `JOB_ACCEPTED` | `{ jobId }` | Gateway takes responsibility |
| Gateway → Server | `JOB_STATUS` | `{ jobId, status, reason? }` | QUEUED / PRINTING / COMPLETED / FAILED |
| Server → Gateway | `CANCEL_JOB` | `{ jobId, reason }` | Cancel request |

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

Server returns the merged print-ready PDF. The token is short-lived and specific to the job.

## Dependencies

- **HTTP server** (Express route registered by router)
- **WebSocket server** (`ws` library, started by channel)
- **Data DB channel** (via router, for gateway state + job lookups)
- **Doc Store channel** (for artifact download)

## State Machines

This channel does not execute state machines. It observes gateway lifecycle state (PRE_ACTIVATION → ACTIVATED → OPERATIONAL) stored by Data DB channel. It detects disconnection/reconnection and publishes `GW_CONNECTED` / `GW_DISCONNECTED` events.

## Tests

`channel-tests/gateway/` (to be created).