# Test Flow Diagrams

This file contains all ASCII flow diagrams for user channel tests.
Each diagram describes the data flow for a specific test case.

---

## GET /gateway/:deviceId

### user.test.ts / GET /gateway/:deviceId / OPERATIONAL gateway returns customer role

```
Browser                          User Channel               Data DB
  │                                    │                      │
  │  GET /gateway/{deviceId}            │                      │
  │───────────────────────────────────→│                      │
  │                                    │                      │
  │         Out_Req(GetGatewayByDeviceId)                    │
  │                                    │─────────────────────→│
  │                                    │← { deviceId, state }│
  │                                    │                      │
  │  200 { role, deviceId, state }     │                      │
  │←───────────────────────────────────│                      │
```

### user.test.ts / GET /gateway/:deviceId / PRE_ACTIVATION gateway returns activation role

```
Browser                          User Channel               Data DB
  │                                    │                      │
  │  GET /gateway/{deviceId}            │                      │
  │───────────────────────────────────→│                      │
  │                                    │                      │
  │  GetGatewayByDeviceId →            │                      │
  │  lifecycleState = "PRE_ACTIVATION" │                      │
  │                                    │                      │
  │  200 { role: "activation", ... }  │                      │
  │←───────────────────────────────────│                      │
```

### user.test.ts / GET /gateway/:deviceId / unknown gateway returns unknown role

```
Browser                          User Channel               Data DB
  │                                    │                      │
  │  GET /gateway/unknown-device        │                      │
  │───────────────────────────────────→│                      │
  │                                    │                      │
  │  GetGatewayByDeviceId → null       │                      │
  │                                    │                      │
  │  200 { role: "unknown", ... }     │                      │
  │←───────────────────────────────────│                      │
```

---

## GET /gateway/:deviceId/capabilities

### user.test.ts / GET /gateway/:deviceId/capabilities / returns printer capabilities for known gateway

```
Browser                          User Channel            Gateway Channel
  │                                    │                      │
  │  GET /gateway/{deviceId}/           │                      │
  │       capabilities                  │                      │
  │───────────────────────────────────→│                      │
  │                                    │                      │
  │   Out_Req(GetPrinterCapabilities)  │                      │
  │                                    │─────────────────────→│
  │                                    │← { printers: [...] }│
  │                                    │                      │
  │  200 { printers: [...] }           │                      │
  │←───────────────────────────────────│                      │
```

### user.test.ts / GET /gateway/:deviceId/capabilities / returns 404 for unknown gateway

```
Browser                          User Channel            Gateway Channel
  │                                    │                      │
  │  GET /gateway/unknown/capabilities  │                      │
  │───────────────────────────────────→│                      │
  │                                    │                      │
  │   Out_Req(GetPrinterCapabilities)  │                      │
  │                                    │─────────────────────→│
  │                                    │← { ok: false }      │
  │                                    │                      │
  │  404 { error }                     │                      │
  │←───────────────────────────────────│                      │
```

---

## GET /gateway/:deviceId/pricing

### user.test.ts / GET /gateway/:deviceId/pricing / returns pricing for known gateway

```
Browser                          User Channel               Data DB
  │                                    │                      │
  │  GET /gateway/{deviceId}/pricing    │                      │
  │───────────────────────────────────→│                      │
  │                                    │                      │
  │  Step 1: GetGatewayByDeviceId      │                      │
  │                                    │─────────────────────→│
  │                                    │← { ownerPhone }     │
  │                                    │                      │
  │  Step 2: GetPricingByOwner         │                      │
  │                                    │─────────────────────→│
  │                                    │← { pricing: [...] } │
  │                                    │                      │
  │  200 { pricing: [...] }            │                      │
  │←───────────────────────────────────│                      │
```

### user.test.ts / GET /gateway/:deviceId/pricing / returns 404 for unknown gateway

```
Browser                          User Channel               Data DB
  │                                    │                      │
  │  GET /gateway/unknown/pricing       │                      │
  │───────────────────────────────────→│                      │
  │                                    │                      │
  │  GetGatewayByDeviceId → not found  │                      │
  │                                    │─────────────────────→│
  │                                    │← { ok: false }      │
  │                                    │                      │
  │  404 { error }                     │                      │
  │←───────────────────────────────────│                      │
```

---

## POST /activate/send-otp

### user.test.ts / POST /activate/send-otp / sends OTP for activatable gateway

```
Browser                          User Channel               Data DB
  │                                    │                      │
  │  POST /activate/send-otp           │                      │
  │  { deviceId, phone }               │                      │
  │───────────────────────────────────→│                      │
  │                                    │                      │
  │  GetGatewayByDeviceId (verify      │                      │
  │  gateway exists & activatable)     │                      │
  │                                    │─────────────────────→│
  │                                    │← { lifecycleState } │
  │                                    │                      │
  │  Generate OTP, store hash          │                      │
  │  deps.sendOtp(phone, otp)          │                      │
  │                                    │                      │
  │  200 { otpRef }                    │                      │
  │←───────────────────────────────────│                      │
```

### user.test.ts / POST /activate/send-otp / rejects OTP for already-activated gateway

```
Browser                          User Channel               Data DB
  │                                    │                      │
  │  POST /activate/send-otp           │                      │
  │  { deviceId: "gw-001", phone }     │                      │
  │───────────────────────────────────→│                      │
  │                                    │                      │
  │  GetGatewayByDeviceId → OPERATIONAL│                      │
  │                                    │─────────────────────→│
  │                                    │← lifecycleState     │
  │                                    │  = "OPERATIONAL"    │
  │                                    │                      │
  │  Gateway is not PRE_ACTIVATION     │                      │
  │  400 { error }                     │                      │
  │←───────────────────────────────────│                      │
```

---

## POST /activate/:deviceId

### user.test.ts / POST /activate/:deviceId / activates gateway with valid OTP

```
Browser                          User Channel               Data DB
  │                                    │                      │
  │  POST /activate/{deviceId}         │                      │
  │  { phone, otp, displayName }       │                      │
  │───────────────────────────────────→│                      │
  │                                    │                      │
  │  Step 1: Verify OTP hash           │                      │
  │  (compare SHA256 of user input     │                      │
  │   vs stored hash)                  │                      │
  │                                    │                      │
  │  Step 2: GetOwnerByPhone           │                      │
  │  (create Owner if new phone)       │                      │
  │                                    │─────────────────────→│
  │                                    │← { owner }          │
  │                                    │                      │
  │  Step 3: UpdateGatewayState        │                      │
  │  PRE_ACTIVATION → ACTIVATED        │                      │
  │                                    │─────────────────────→│
  │                                    │← { lifecycleState } │
  │                                    │                      │
  │  200 { deviceId, state }           │                      │
  │←───────────────────────────────────│                      │
  │                                    │                      │
  │  ── if OTP invalid ──              │                      │
  │  401 { error }                     │                      │
  │  ←──────────────────────────────────│                      │
```

---

## POST /owner/:phone/pricing

### user.test.ts / POST /owner/:phone/pricing / sets pricing successfully

```
Browser                          User Channel               Data DB
  │                                    │                      │
  │  POST /owner/{phone}/pricing       │                      │
  │  { prices: [...] }                 │                      │
  │───────────────────────────────────→│                      │
  │                                    │                      │
  │  Out_Req(SetPricing) per item      │                      │
  │                                    │─────────────────────→│
  │                                    │← { ok }             │
  │                                    │                      │
  │  200 { ok }                        │                      │
  │←───────────────────────────────────│                      │
```

---

## POST /session

### user.test.ts / POST /session / creates customer session

```
Browser                          User Channel               Data DB
  │                                    │                      │
  │  POST /session                     │                      │
  │  { gatewayId }                     │                      │
  │───────────────────────────────────→│                      │
  │                                    │                      │
  │  Generate sessionToken (UUID)      │                      │
  │                                    │                      │
  │  Out_Req(CreateSession)            │                      │
  │  { gatewayId, sessionToken,        │                      │
  │    mode, expiresAt }               │                      │
  │                                    │─────────────────────→│
  │                                    │← { id, sessionToken}│
  │                                    │                      │
  │  200 { id, sessionToken }          │                      │
  │←───────────────────────────────────│                      │
```

---

## GET /session/:token

### user.test.ts / GET /session/:token / returns session for valid token

```
Browser                          User Channel               Data DB
  │                                    │                      │
  │  GET /session/{token}              │                      │
  │───────────────────────────────────→│                      │
  │                                    │                      │
  │  Out_Req(GetSessionByToken)        │                      │
  │                                    │─────────────────────→│
  │                                    │← session record     │
  │                                    │                      │
  │  200 { id, sessionToken, mode }    │                      │
  │←───────────────────────────────────│                      │
```

### user.test.ts / GET /session/:token / returns 404 for invalid token

```
Browser                          User Channel               Data DB
  │                                    │                      │
  │  GET /session/invalid-token        │                      │
  │───────────────────────────────────→│                      │
  │                                    │                      │
  │  Out_Req(GetSessionByToken) → null │                      │
  │                                    │─────────────────────→│
  │                                    │← null               │
  │                                    │                      │
  │  404 { error }                     │                      │
  │←───────────────────────────────────│                      │
```

---

## POST /session/:token/checkout

### user.test.ts / POST /session/:token/checkout / creates Razorpay order for valid session

```
Browser                  User Channel        Router     Payment    Data DB
  │                            │                │          │          │
  │  POST /session/{token}/    │                │          │          │
  │       checkout             │                │          │          │
  │  { amountPaise,            │                │          │          │
  │    documents[] }           │                │          │          │
  │───────────────────────────→│                │          │          │
  │                            │                │          │          │
  │  Step 1: Verify session    │                │          │          │
  │                            │────────────────→│─────────→│          │
  │                            │← { session }   │          │          │
  │                            │                │          │          │
  │  Step 2: Preflight check   │                │          │          │
  │  (RequestPreFlight)        │                │          │          │
  │                            │────────────────→│──────────         │
  │                            │← { ok }        │                   │
  │                            │                │          │          │
  │  Step 3: Create Razorpay   │                │          │          │
  │          order             │                │          │          │
  │                            │────────────────→│─────────→│          │
  │                            │← { orderId }   │          │          │
  │                            │                │          │          │
  │  Step 4: Persist on        │                │          │          │
  │          session           │                │          │          │
  │                            │────────────────→│─────────→│          │
  │                            │← { ok }        │          │          │
  │                            │                │          │          │
  │  200 { orderId,            │                │          │          │
  │       amountPaise }         │                │          │          │
  │←───────────────────────────│                │          │          │
```

### user.test.ts / POST /session/:token/checkout / rejects invalid session token

```
Browser                          User Channel
  │                                    │
  │  POST /session/invalid-token/      │
  │       checkout                      │
  │  { amountPaise, documents[] }       │
  │───────────────────────────────────→│
  │                                    │
  │  GetSessionByToken → null          │
  │                                    │
  │  404 { error }                     │
  │←───────────────────────────────────│
```

---

## POST /session/:token/confirm

### user.test.ts / POST /session/:token/confirm / confirms payment with valid signature

```
Browser                  User Channel        Router     Payment    Data DB
  │                            │                │          │          │
  │  POST /session/{token}/    │                │          │          │
  │       confirm              │                │          │          │
  │  { orderId, paymentId,     │                │          │          │
  │    signature, amountPaise } │                │          │          │
  │───────────────────────────→│                │          │          │
  │                            │                │          │          │
  │  Step 1: Resolve session   │                │          │          │
  │                            │────────────────→│─────────→│          │
  │                            │← { session }   │          │          │
  │                            │                │          │          │
  │  Step 2: Verify amount     │                │          │          │
  │  (session.metadata.amount  │                │          │          │
  │   === body.amountPaise)    │                │          │          │
  │                            │                │          │          │
  │  Step 3: Verify signature  │                │          │          │
  │                            │────────────────→│─────────→│          │
  │                            │← { verified }  │          │          │
  │                            │                │          │          │
  │  Step 4: Persist payment   │                │          │          │
  │                            │────────────────→│─────────→│          │
  │                            │← { ok }        │          │          │
  │                            │                │          │          │
  │  200 { verified: true }    │                │          │          │
  │←───────────────────────────│                │          │          │
```

---

## POST /session/:token/upload

### user.test.ts / POST /session/:token/upload / uploads file and creates job

```
Browser                  User Channel             Router    Doc Store  Data DB  Gateway
  │                            │                      │          │        │        │
  │  POST /session/{token}/    │                      │          │        │        │
  │       upload               │                      │          │        │        │
  │  (multipart files[]        │                      │          │        │        │
  │   + configs[])             │                      │          │        │        │
  │───────────────────────────→│                      │          │        │        │
  │                            │                      │          │        │        │
  │  Step 1: Verify session    │                      │          │        │        │
  │  + payment confirmed       │                      │          │        │        │
  │                            │─────────────────────→│─────────→│        │        │
  │                            │← { session }         │          │        │        │
  │                            │                      │          │        │        │
  │  Step 2: Store each        │                      │          │        │        │
  │          file in S3        │                      │          │        │        │
  │                            │─────────────────────→│─────────→│        │        │
  │                            │← { storageKey }      │          │        │        │
  │                            │                      │          │        │        │
  │  Step 3: Create doc        │                      │          │        │        │
  │          record            │                      │          │        │        │
  │                            │─────────────────────→│─────────→│────────→│        │
  │                            │← { docId }           │          │        │        │
  │                            │                      │          │        │        │
  │  Step 4: Create print job  │                      │          │        │        │
  │                            │─────────────────────→│─────────→│────────→│        │
  │                            │← { jobId, jobNumber }│          │        │        │
  │                            │                      │          │        │        │
  │  Step 5: Record payment    │                      │          │        │        │
  │                            │─────────────────────→│─────────→│────────→│        │
  │                            │← { paymentId }       │          │        │        │
  │                            │                      │          │        │        │
  │  Step 6: Dispatch to       │                      │          │        │        │
  │          gateway           │                      │          │        │        │
  │                            │─────────────────────→│─────────→│────────→│────────→│
  │                            │                      │          │        │← { ok }│
  │                            │                      │          │        │        │
  │  200 { jobId, jobNumber }  │                      │          │        │        │
  │←───────────────────────────│                      │          │        │        │
```

### user.test.ts / POST /session/:token/upload / rejects upload without payment confirmation

```
Browser                          User Channel
  │                                    │
  │  POST /session/{token}/upload      │
  │  (files + configs)                 │
  │───────────────────────────────────→│
  │                                    │
  │  GetSessionByToken → session       │
  │  metadata.paymentId = null         │
  │  → "Payment not confirmed"         │
  │                                    │
  │  400 { error }                     │
  │←───────────────────────────────────│
```

---

## GET /job/:jobId/status

### user.test.ts / GET /job/:jobId/status / returns job state for valid job

```
Browser                          User Channel               Data DB
  │                                    │                      │
  │  GET /job/{jobId}/status           │                      │
  │───────────────────────────────────→│                      │
  │                                    │                      │
  │  Out_Req(GetPrintJob)              │                      │
  │                                    │─────────────────────→│
  │                                    │← { state, ... }     │
  │                                    │                      │
  │  200 { jobId, state }              │                      │
  │←───────────────────────────────────│                      │
```

### user.test.ts / GET /job/:jobId/status / returns 404 for unknown job

```
Browser                          User Channel               Data DB
  │                                    │                      │
  │  GET /job/unknown-job/status       │                      │
  │───────────────────────────────────→│                      │
  │                                    │                      │
  │  Out_Req(GetPrintJob) → null       │                      │
  │                                    │─────────────────────→│
  │                                    │← null               │
  │                                    │                      │
  │  404 { error }                     │                      │
  │←───────────────────────────────────│                      │
```

---

## Legend

```
Actor                          Channel                       External Service
  │                                    │                      │
  │  HTTP/WS request                   │                      │
  │───────────────────────────────────→│                      │
  │                                    │                      │
  │  Response                          │                      │
  │←───────────────────────────────────│                      │
  │                                    │                      │
  │  Internal processing               │                      │
  │  (no network hop)                  │                      │
```