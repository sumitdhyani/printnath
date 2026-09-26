# Test Flow Diagrams

This file contains all ASCII flow diagrams for gateway channel tests.
Each diagram describes the data flow for a specific test case.

---

## HTTP HELLO

### gateway.test.ts / HTTP HELLO / known device returns OPERATIONAL state

```
Gateway                          Server (Gateway Channel)
  │                                    │
  │  POST /api/gateway/hello           │
  │  { deviceId: "device-abc" }        │
  │───────────────────────────────────→│
  │                                    │
  │  sendToRouter(RequestDeviceDetails) │
  │  ← returns OPERATIONAL state       │
  │                                    │
  │  200 { state: "OPERATIONAL",       │
  │        deviceToken: "dev-token" }  │
  │←───────────────────────────────────│
```

### gateway.test.ts / HTTP HELLO / unknown device returns 404

```
Gateway                          Server
  │                                    │
  │  POST /api/gateway/hello           │
  │  { deviceId: "device-unknown" }    │
  │───────────────────────────────────→│
  │                                    │
  │  sendToRouter(RequestDeviceDetails) │
  │  ← returns ok:false                │
  │                                    │
  │  404 { error: "Unknown device" }   │
  │←───────────────────────────────────│
```

---

## WebSocket lifecycle

### gateway.test.ts / WebSocket lifecycle / connect then disconnect fires GW_DISCONNECTED

```
Fake Gateway                      Server
  │                                    │
  │  WS connect /ws/gateway            │
  │  ?deviceId="device-abc"            │
  │───────────────────────────────────→│
  │                                    │
  │  deviceToConn.set("device-abc", —) │
  │                                    │
  │  [connection established]          │
  │                                    │
  │  ── later ──                       │
  │                                    │
  │  WS disconnect                     │
  │───────────────────────────────────→│
  │                                    │
  │  sendToRouter(GW_DISCONNECTED)     │
  │  { deviceId: "device-abc" }        │
  │                                    │
  │  deviceCapabilities.delete()       │
```

---

## Printer capabilities

### gateway.test.ts / Printer capabilities / CAPABILITY_INFO is cached and returned via execute

```
Fake Gateway                      Server
  │                                    │
  │  WS connect                        │
  │───────────────────────────────────→│
  │                                    │
  │  WS: CAPABILITY_INFO               │
  │  { printers: [...] }               │
  │←───────────────────────────────────│
  │                                    │
  │  deviceCapabilities.set(device, —) │
  │                                    │
  │  Router                            │
  │    │ execute(GetPrinterCapabilities)│
  │    │ { deviceId }                  │
  │    │──────────────────────────────→│
  │    │                               │
  │    │ ← { printers: [...] } (cached)│
  │    │←──────────────────────────────│
```

---

## RequestPreFlight

### gateway.test.ts / RequestPreFlight / gateway accepts — returns ok:true

```
Router                        Server (Gateway Channel)         Fake Gateway
  │                                    │                            │
  │ execute(RequestPreFlight)          │                            │
  │ { deviceId, documents }            │                            │
  │───────────────────────────────────→│                            │
  │                                    │                            │
  │                         WS: PRINT_PREFLIGHT                    │
  │                         { reqId, documents }                   │
  │                                    │───────────────────────────→│
  │                                    │                            │
  │                         WS: PRINT_PREFLIGHT_RESPONSE           │
  │                         { reqId, canFulfill: true }            │
  │                                    │←───────────────────────────│
  │                                    │                            │
  │ ← { ok: true }                     │                            │
  │←───────────────────────────────────│                            │
```

### gateway.test.ts / RequestPreFlight / gateway rejects — returns ok:false with reason

```
Router                        Server                             Fake Gateway
  │                                    │                            │
  │ execute(RequestPreFlight)          │                            │
  │───────────────────────────────────→│                            │
  │                         WS: PRINT_PREFLIGHT                    │
  │                                    │───────────────────────────→│
  │                                    │                            │
  │                         WS: PRINT_PREFLIGHT_RESPONSE           │
  │                         { reqId, canFulfill: false,            │
  │                           reason: "Color unavailable" }        │
  │                                    │←───────────────────────────│
  │                                    │                            │
  │ ← { ok: false,                     │                            │
  │     error: "Color unavailable" }   │                            │
  │←───────────────────────────────────│                            │
```

### gateway.test.ts / RequestPreFlight / gateway not connected — returns error

```
Router                        Server
  │                                    │
  │ execute(RequestPreFlight)          │
  │ { deviceId: "unknown" }            │
  │───────────────────────────────────→│
  │                                    │
  │  deviceToConn.get() → null         │
  │                                    │
  │ ← { ok: false,                     │
  │     error: "Gateway not connected" }│
  │←───────────────────────────────────│
```

### gateway.test.ts / RequestPreFlight / no response — times out

```
Router                        Server                             Fake Gateway
  │                                    │                            │
  │ execute(RequestPreFlight)          │                            │
  │───────────────────────────────────→│                            │
  │                         WS: PRINT_PREFLIGHT                    │
  │                                    │───────────────────────────→│
  │                                    │                            │
  │  [30s timeout — no response]       │                            │
  │                                    │                            │
  │ ← { ok: false,                     │                            │
  │     error: "Preflight timeout" }   │                            │
  │←───────────────────────────────────│                            │
```

---

## RequestPrint

### gateway.test.ts / RequestPrint / gateway accepts — returns ok:true

```
Router                        Server                             Fake Gateway
  │                                    │                            │
  │ execute(RequestPrint)              │                            │
  │ { deviceId, jobId,                 │                            │
  │   artifactUrl, authToken,          │                            │
  │   documents }                      │                            │
  │───────────────────────────────────→│                            │
  │                                    │                            │
  │                         WS: PRINT_JOB                          │
  │                         { jobId, artifactUrl,                  │
  │                           authToken, documents }               │
  │                                    │───────────────────────────→│
  │                                    │                            │
  │                         WS: JOB_ACCEPTED                       │
  │                         { jobId }                              │
  │                                    │←───────────────────────────│
  │                                    │                            │
  │ ← { ok: true }                     │                            │
  │←───────────────────────────────────│                            │
```

### gateway.test.ts / RequestPrint / gateway not connected — returns error

```
Router                        Server
  │                                    │
  │ execute(RequestPrint)              │
  │ { deviceId: "unknown" }            │
  │───────────────────────────────────→│
  │                                    │
  │ ← { ok: false,                     │
  │     error: "Gateway not connected" }│
  │←───────────────────────────────────│
```

### gateway.test.ts / RequestPrint / no response — times out

```
Router                        Server                             Fake Gateway
  │                                    │                            │
  │ execute(RequestPrint)              │                            │
  │───────────────────────────────────→│                            │
  │                         WS: PRINT_JOB                          │
  │                                    │───────────────────────────→│
  │                                    │                            │
  │  [10s timeout — no response]       │                            │
  │                                    │                            │
  │ ← { ok: false,                     │                            │
  │     error: "Job accept timeout" }  │                            │
  │←───────────────────────────────────│                            │
```

---

## JOB_STATUS forwarding

### gateway.test.ts / JOB_STATUS forwarding / forwards status updates as Out_Us events

```
Fake Gateway                      Server
  │                                    │
  │  WS: JOB_STATUS                    │
  │  { jobId, status: "PRINTING",     │
  │    at: "..." }                     │
  │───────────────────────────────────→│
  │                                    │
  │  sendToRouter(JOB_STATUS_UPDATE)   │
  │  { deviceId, jobId,               │
  │    status: "PRINTING" }            │
  │                                    │
  │  ── later ──                       │
  │                                    │
  │  WS: JOB_STATUS                    │
  │  { jobId, status: "COMPLETED",    │
  │    at: "..." }                     │
  │───────────────────────────────────→│
  │                                    │
  │  sendToRouter(JOB_STATUS_UPDATE)   │
  │  { deviceId, jobId,               │
  │    status: "COMPLETED" }           │
```

---

## Artifact download

### gateway.test.ts / Artifact download / valid token streams the artifact

```
Gateway                          Server (Gateway Channel)
  │                                    │
  │  GET /api/gateway/jobs/job-001/artifact
  │  Authorization: Bearer valid-token │
  │───────────────────────────────────→│
  │                                    │
  │  sendToRouter(ValidateArtifactToken)│
  │  ← { valid: true }                 │
  │                                    │
  │  sendToRouter(FetchArtifact)        │
  │  ← Readable stream                 │
  │                                    │
  │  200 Content-Type: application/pdf │
  │  [PDF bytes]                       │
  │←───────────────────────────────────│
```

---

## Legend

```
Actor                          Channel                       External Service
  │                                    │                      │
  │  Request                          │                      │
  │───────────────────────────────────→│                      │
  │                                    │                      │
  │  Response                          │                      │
  │←───────────────────────────────────│                      │
```