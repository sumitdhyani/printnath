# User Channel

The user channel is the HTTP-facing layer that serves the browser UI for both shop owners and customers. It receives HTTP requests, translates them into channel operations via the router, and returns HTTP responses.

## Users

| User | Device | Flow |
|------|--------|------|
| Shop Owner | Phone browser | Activate gateway, set pricing |
| Customer (walk-in) | Phone browser | Upload docs, configure, pay, print |

## Prerequisites

Before any user channel flow works, a gateway device must exist in the system:

1. **Gateway boots** → HELLO with `deviceId` → gateway channel calls `preRegisterDevice` (data-db)
2. Device enters **PRE_ACTIVATION** state
3. QR code with activation URL is displayed on the gateway screen

The user channel only sees devices that are already in the system.

## Contract

The user channel is unique — it has **no In_Req** (router never asks it to do anything). It only initiates **Out_Req** to the router to coordinate other channels.

### Out_Req (User Channel → Router)

| Method | Args | Result | Called During |
|--------|------|--------|---------------|
| `initiateOwnerOtp` | `{ phone }` | `{ otpRef }` | Owner activation |
| `activateGateway` | `{ deviceId, phone, otp, displayName? }` | `{ deviceId, lifecycleState }` | Owner activation |
| `setShopPricing` | `{ ownerPhone, pageType, pricePaise }` | `{}` | Owner pricing setup |
| `getGatewayStatus` | `{ deviceId }` | `{ deviceId, lifecycleState, deviceToken? }` | Activation page load |
| `getOwnerInfo` | `{ shopCode }` | `{ shopCode, shopName?, lifecycleState }` | Customer QR scan |
| `getSession` | `{ sessionToken }` | `{ id, sessionToken, mode }` | Session check |
| `initiateCheckout` | `{ sessionToken, amountPaise }` | `{ orderId, amountPaise }` | Customer taps Pay |
| `confirmPayment` | `{ sessionToken, orderId, paymentId, signature }` | `{ verified: true }` | Payment callback |
| `uploadDocument` | `{ sessionToken, files + printConfig }` | `{ jobId, jobNumber }` | Upload + create job |
| `getJobStatus` | `{ jobId }` | `{ jobId, state }` | Status polling |

### Downstream Methods Called via Router

The user channel delegates to these existing channel methods through the router:

**Data DB:**
- `getGatewayByDeviceId` — gateway lookup
- `createOwner` — register shop owner
- `updateGatewayState` — transition gateway lifecycle
- `setPricing` / `getPricingByOwner` — pricing CRUD
- `createSession` / `getSessionByToken` / `updateSessionState` / `updateSessionMetadata` — session mgmt
- `createDocument` / `getDocumentsBySession` — document records
- `createPrintJob` / `getPrintJob` / `updateJobState` — job lifecycle
- `createPayment` / `updatePaymentStatus` — payment records

**Doc Store:**
- `storeArtifact` — store uploaded file to S3

**Payment:**
- `createOrder` — Razorpay order
- `verifyPayment` — signature verification

### 1. InitiateOwnerOtp

**Trigger:** Shop owner enters phone on activation page.

```
Browser                  User Channel              Router               Data DB
  │                            │                      │                    │
  │ POST /activate/{deviceId}  │                      │                    │
  │ { phone }                  │                      │                    │
  │───────────────────────────→│                      │                    │
  │                            │ execute(InitiateOwnerOtp)                │
  │                            │─────────────────────→│                   │
  │                            │                      │ (placeholder —    │
  │                            │                      │  SMS integration  │
  │                            │                      │  goes here later) │
  │                            │                      │                   │
  │                            │← { ok: true,         │                   │
  │                            │    result: { otpRef }}│                   │
  │ 200 { otpRef }             │                      │                   │
  │←───────────────────────────│                      │                   │
```

**Notes:**
- For dev, OTP is logged to console: `console.log(\`OTP for ${phone}: ${otp}\`)`
- In production, SMS via Twilio/MSG91
- `otpRef` is a session ID to correlate the OTP verify step
- OTP stored as SHA256 hash in a temporary session record (or in-memory for v1)

---

### 2. ActivateGateway

**Trigger:** Shop owner enters OTP, sets display name.

```
Browser                  User Channel               Router              Data DB
  │                            │                      │                    │
  │ POST /activate/{deviceId}  │                      │                    │
  │ { phone, otp, displayName }│                      │                    │
  │───────────────────────────→│                      │                    │
  │                            │                      │                    │
  │ Step 1: Verify OTP         │                      │                    │
  │                            │ (compare SHA256 vs   │                    │
  │                            │  stored otpHash)     │                    │
  │                            │                      │                    │
  │ ── if OTP invalid ──       │                      │                    │
  │ 401 { error }              │                      │                    │
  │←───────────────────────────│                      │                    │
  │                            │                      │                    │
  │ Step 2: Create owner (if   │                      │                    │
  │         new phone)         │                      │                    │
  │                            │ Out_Req(CreateOwner) │                    │
  │                            │─────────────────────→│───────────────────→│
  │                            │                      │← { phone }        │
  │                            │←─────────────────────│←──────────────────│
  │                            │                      │                    │
  │ Step 3: Update gateway     │                      │                    │
  │         to ACTIVATED       │                      │                    │
  │                            │ Out_Req(UpdateGatewayState)              │
  │                            │  { deviceId,         │                    │
  │                            │    lifecycleState:    │                    │
  │                            │      'ACTIVATED',    │                    │
  │                            │    ownerPhone }       │                    │
  │                            │─────────────────────→│───────────────────→│
  │                            │                      │← { ok }           │
  │                            │←─────────────────────│←──────────────────│
  │                            │                      │                    │
  │ 200 { deviceId, state }    │                      │                    │
  │←───────────────────────────│                      │                    │
```

**Notes:**
- If owner already exists (phone found via `GetOwnerByPhone`), skip `CreateOwner`
- Gateway state moves from PRE_ACTIVATION → ACTIVATED
- Gateway becomes OPERATIONAL when it connects via WebSocket

---

### 3. SetShopPricing

**Trigger:** Shop owner sets per-page prices after activation.

```
Browser                  User Channel               Router              Data DB
  │                            │                      │                    │
  │ POST /owner/{phone}/       │                      │                    │
  │      pricing               │                      │                    │
  │ { pageType, pricePaise }   │                      │                    │
  │───────────────────────────→│                      │                    │
  │                            │ Out_Req(SetPricing)  │                    │
  │                            │─────────────────────→│───────────────────→│
  │                            │                      │← { ok }           │
  │                            │←─────────────────────│←──────────────────│
  │ 200                        │                      │                    │
  │←───────────────────────────│                      │                    │
```

**Notes:**
- Called once per `pageType` (e.g. `B_W_A4`, `COLOR_A4`)
- Owner calls this multiple times to set all price tiers
- Uses data-db's `SetPricing` (upsert) internally

---

### 4. GetGatewayStatus

**Trigger:** Activation page loads, shows gateway state.

```
Browser                  User Channel               Router              Data DB
  │                            │                      │                    │
  │ GET /activate/{deviceId}   │                      │                    │
  │───────────────────────────→│                      │                    │
  │                            │ Out_Req(GetGatewayByDeviceId)             │
  │                            │─────────────────────→│───────────────────→│
  │                            │                      │← gateway record   │
  │                            │←─────────────────────│←──────────────────│
  │                            │                      │                    │
  │ 200 { deviceId, state,     │                      │                    │
  │       ownerPhone?,          │                      │                    │
  │       deviceToken? }        │                      │                    │
  │←───────────────────────────│                      │                    │
```

**Notes:**
- Returns current lifecycle state so the activation page knows what to show
- PRE_ACTIVATION → show activation form
- ACTIVATED → show "Gateway active, waiting for connection"
- OPERATIONAL → redirect to dashboard

---

### 5. GetOwnerInfo

**Trigger:** Customer scans QR code at shop.

```
Browser                  User Channel               Router              Data DB
  │                            │                      │                    │
  │ GET /s/{shopCode}          │                      │                    │
  │───────────────────────────→│                      │                    │
  │                            │                      │                    │
  │ Step 1: Resolve shopCode   │                      │                    │
  │         → gatewayId        │                      │                    │
  │    (local mapping or       │                      │                    │
  │     query by shopCode)     │                      │                    │
  │                            │                      │                    │
  │ Step 2: Get gateway        │                      │                    │
  │         by deviceId        │                      │                    │
  │                            │ Out_Req(GetGatewayByDeviceId)             │
  │                            │─────────────────────→│───────────────────→│
  │                            │                      │← gateway record    │
  │                            │←─────────────────────│←──────────────────│
  │                            │                      │                    │
  │ Step 3: Get pricing        │                      │                    │
  │         by ownerPhone      │                      │                    │
  │                            │ Out_Req(GetPricingByOwner)               │
  │                            │─────────────────────→│───────────────────→│
  │                            │                      │← pricing array    │
  │                            │←─────────────────────│←──────────────────│
  │                            │                      │                    │
  │ 200 { shopName, state,     │                      │                    │
  │       pricing: [...] }     │                      │                    │
  │←───────────────────────────│                      │                    │
```

**Notes:**
- If gateway not OPERATIONAL, return error: "Shop not yet active"
- QR code maps shopCode → gatewayId (stored in gateway record or a separate mapping)
- Later: add shopName from gateway record

---

### 6. GetPricing

**Trigger:** Customer scans QR, browser loads pricing to show per-page costs.

```
Browser                  User Channel               Router              Data DB
  │                            │                      │                    │
  │ GET /gateway/{deviceId}/   │                      │                    │
  │      pricing               │                      │                    │
  │───────────────────────────→│                      │                    │
  │                            │                      │                    │
  │ Step 1: Resolve deviceId   │                      │                    │
  │         → ownerPhone       │                      │                    │
  │                            │ Out_Req(GetGatewayByDeviceId)             │
  │                            │─────────────────────→│───────────────────→│
  │                            │                      │← { ownerPhone }    │
  │                            │←─────────────────────│←──────────────────│
  │                            │                      │                    │
  │ Step 2: Get pricing        │                      │                    │
  │         by ownerPhone      │                      │                    │
  │                            │ Out_Req(GetPricingByOwner)               │
  │                            │─────────────────────→│───────────────────→│
  │                            │                      │← pricing array    │
  │                            │←─────────────────────│←──────────────────│
  │                            │                      │                    │
  │ 200 { pricing: [...] }    │                      │                    │
  │←───────────────────────────│                      │                    │
```

**Notes:**
- No session needed — browser already has deviceId from QR scan
- ownerPhone never exposed to browser, resolved server-side
- Returns all available page types + prices for this shop

---

### 7. CreateSession

**Trigger:** Browser loads customer UI after QR scan, creates a session for subsequent upload/checkout flows.

```
Browser                  User Channel               Router              Data DB
  │                            │                      │                    │
  │ POST /session              │                      │                    │
  │ { gatewayId }              │                      │                    │
  │───────────────────────────→│                      │                    │
  │                            │ Generate sessionToken│                    │
  │                            │ (UUID)               │                    │
  │                            │                      │                    │
  │                            │ Out_Req(CreateSession)                   │
  │                            │ { gatewayId,          │                    │
  │                            │   sessionToken,       │                    │
  │                            │   mode: 'customer',   │                    │
  │                            │   expiresAt }          │                    │
  │                            │─────────────────────→│───────────────────→│
  │                            │                      │← { id,             │
  │                            │                      │    sessionToken }  │
  │                            │←─────────────────────│←──────────────────│
  │                            │                      │                    │
  │ 200 { id, sessionToken }  │                      │                    │
  │←───────────────────────────│                      │                    │
```

**Notes:**
- sessionToken is the handle for all subsequent customer calls
- TTL configured via `sessionTtlMs` in `UserChannelDeps`

---

### 8. GetSession

**Trigger:** Browser polls session state, or redirect requires session data.

```
Browser                  User Channel               Router              Data DB
  │                            │                      │                    │
  │ GET /session/{token}       │                      │                    │
  │───────────────────────────→│                      │                    │
  │                            │ Out_Req(GetSessionByToken)               │
  │                            │─────────────────────→│───────────────────→│
  │                            │                      │← session record   │
  │                            │←─────────────────────│←──────────────────│
  │                            │                      │                    │
  │ 200 { id, sessionToken,    │                      │                    │
  │       mode }               │                      │                    │
  │←───────────────────────────│                      │                    │
```

---

### 9. InitiateCheckout

**Trigger:** Customer taps "Pay Now" after configuring.

```
Browser                  User Channel              Router           Payment    Data DB
  │                            │                      │                │          │
  │ POST /session/{token}/     │                      │                │          │
  │      checkout              │                      │                │          │
  │ { amountPaise }            │                      │                │          │
  │───────────────────────────→│                      │                │          │
  │                            │                      │                │          │
  │ Step 1: Create Razorpay    │                      │                │          │
  │         order              │                      │                │          │
  │                            │ Out_Req(CreateOrder) │                │          │
  │                            │─────────────────────→│──────────────→│          │
  │                            │                      │← { orderId,    │          │
  │                            │                      │    amount }    │          │
  │                            │←─────────────────────│←──────────────│          │
  │                            │                      │                │          │
  │ Step 2: Persist order      │                      │                │          │
  │         on session         │                      │                │          │
  │                            │ Out_Req(UpdateSessionMetadata)         │
  │                            │ { orderId, amountPaise }               │
  │                            │─────────────────────→│──────────────→│
  │                            │                      │← { id }       │
  │                            │←─────────────────────│←──────────────│
  │                            │                      │                │
  │ 200 { orderId,             │                      │                │
  │       amountPaise }         │                      │                │
  │←───────────────────────────│                      │                │
```

**Notes:**
- Browser receives orderId, opens Razorpay checkout on phone
- orderId + amountPaise persisted on session metadata for upload-time verification

---

### 10. ConfirmPayment

**Trigger:** Razorpay redirects back to our site after customer pays.

**Purpose:** Verify Razorpay signature, FE-sent amount matches stored order, persist payment confirmation. Job + payment records created later in UploadDocument (§11).

```
Browser                  User Channel              Router           Payment    Data DB
  │                            │                      │                │          │
  │ POST /session/{token}/     │                      │                │          │
  │      confirm               │                      │                │          │
  │ { orderId, paymentId,      │                      │                │          │
  │   signature, amountPaise }  │                      │                │          │
  │───────────────────────────→│                      │                │          │
  │                            │                      │                │          │
  │ Step 1: Resolve session    │                      │                │          │
  │                            │ Out_Req(GetSessionByToken)             │          │
  │                            │─────────────────────→│──────────────→│
  │                            │                      │← { metadata    │
  │                            │                      │  { amountPaise }}│
  │                            │←─────────────────────│←──────────────│
  │                            │                      │                │
  │ ── if session not found ── │                      │                │
  │ 404 { error }              │                      │                │
  │←───────────────────────────│                      │                │
  │                            │                      │                │
  │ Step 2: Verify amount      │                      │                │
  │         matches stored     │                      │                │
  │ (session.metadata.amount   │                      │                │
  │  === body.amountPaise)     │                      │                │
  │                            │                      │                │
  │ ── if mismatch ──          │                      │                │
  │ 400 { error }              │                      │                │
  │←───────────────────────────│                      │                │
  │                            │                      │                │
  │ Step 3: Verify signature   │                      │                │
  │                            │ Out_Req(VerifyPayment)                │
  │                            │─────────────────────→│──────────────→
  │                            │                      │← { verified }
  │                            │←─────────────────────│←──────────────
  │                            │                      │                │
  │ ── if !verified ──         │                      │                │
  │ 401 { error }              │                      │                │
  │←───────────────────────────│                      │                │
  │                            │                      │                │
  │ Step 4: Persist payment    │                      │                │
  │         confirmation       │                      │                │
  │                            │ Out_Req(UpdateSessionMetadata)        │
  │                            │ { paymentId,         │                │
  │                            │   verifiedAt }        │                │
  │                            │─────────────────────→│──────────────→│
  │                            │                      │← { id }       │
  │                            │←─────────────────────│←──────────────│
  │                            │                      │                │
  │ 200 { verified: true }     │                      │                │
  │←───────────────────────────│                      │                │
```

**Notes:**
- Signature verification prevents payment forgery (HMAC SHA256)
- FE-sent amountPaise compared against value stored at checkout (authoritative)
- No job or payment record created here — deferred to upload (§11)
- FE proceeds to upload documents + print config automatically

---

### 11. UploadDocument (Post-Payment)

**Trigger:** After payment confirmed, FE automatically uploads file(s) + print config.
Creates print job, records payment, dispatches to gateway.

```
Browser                  User Channel             Router         Doc Store    Data DB    Gateway
  │                            │                      │               │            │          │
  │ POST /session/{token}/     │                      │               │            │          │
  │      upload                │                      │               │            │          │
  │ (multipart files +         │                      │               │            │          │
  │  print config)             │                      │               │            │          │
  │───────────────────────────→│                      │               │            │          │
  │                            │                      │               │            │          │
  │ Step 1: Store doc(s)       │                      │               │            │          │
  │         in S3              │                      │               │            │          │
  │                            │ Out_Req(StoreArtifact)               │            │          │
  │                            │─────────────────────→│──────────────→│            │          │
  │                            │                      │← storageKey   │            │          │
  │                            │←─────────────────────│←──────────────│            │          │
  │                            │                      │               │            │          │
  │ Step 2: Create doc record  │                      │               │            │          │
  │                            │ Out_Req(CreateDocument)              │            │          │
  │                            │─────────────────────→│──────────────→│───────────→│          │
  │                            │                      │               │← { id }    │          │
  │                            │←─────────────────────│←──────────────│←──────────│          │
  │                            │                      │               │            │          │
  │ Step 3: Create print job   │                      │               │            │          │
  │         with docs + config │                      │               │            │          │
  │                            │ Out_Req(CreatePrintJob)              │            │          │
  │                            │─────────────────────→│──────────────→│───────────→│          │
  │                            │                      │               │← { jobId,  │          │
  │                            │                      │               │   jobNumber}│          │
  │                            │←─────────────────────│←──────────────│←──────────│          │
  │                            │                      │               │            │          │
  │ Step 4: Record payment     │                      │               │            │          │
  │         in data-db         │                      │               │            │          │
  │                            │ Out_Req(CreatePayment)               │            │          │
  │                            │─────────────────────→│──────────────→│───────────→│          │
  │                            │                      │               │← { id }    │          │
  │                            │←─────────────────────│←──────────────│←──────────│          │
  │                            │                      │               │            │          │
  │ Step 5: Dispatch to        │                      │               │            │          │
  │         gateway            │                      │               │            │          │
  │                            │ Out_Req(RequestPreFlight)             │            │          │
  │                            │─────────────────────→│──────────────→│───────────→│─────────→│
  │                            │                      │               │            │← { ok }  │
  │                            │←─────────────────────│←──────────────│←──────────│←────────│
  │                            │                      │               │            │          │
  │                            │ Out_Req(RequestPrint)                │            │          │
  │                            │─────────────────────→│──────────────→│───────────→│─────────→│
  │                            │                      │               │            │← { ok }  │
  │                            │←─────────────────────│←──────────────│←──────────│←────────│
  │                            │                      │               │            │          │
  │ 200 { jobId, jobNumber }   │                      │               │            │          │
  │←───────────────────────────│                      │               │            │          │
```

**Notes:**
- FE uploads automatically after Razorpay confirm callback
- Print config (pageType, copies, duplex, paper size) sent with upload
- CreatePrintJob creates job + JobDocument join records atomically
- Gateway dispatch happens immediately — no separate step needed

---

### 12. GetJobStatus

**Trigger:** Browser polls to show "Printing..." / "Done!" status.

```
Browser                  User Channel               Router              Data DB
  │                            │                      │                    │
  │ GET /job/{jobId}/status    │                      │                    │
  │───────────────────────────→│                      │                    │
  │                            │ Out_Req(GetPrintJob)  │                    │
  │                            │─────────────────────→│───────────────────→│
  │                            │                      │← { state, ... }   │
  │                            │←─────────────────────│←──────────────────│
  │                            │                      │                    │
  │ 200 { jobId, state }      │                      │                    │
  │←───────────────────────────│                      │                    │
```

## API Endpoints

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `GET` | `/gateway/:deviceId` | — | QR entry point. Returns `{ role, deviceId, state }` |
| `GET` | `/gateway/:deviceId/capabilities` | — | Printer capabilities (via gateway channel) |
| `GET` | `/gateway/:deviceId/pricing` | — | Customer pricing. Resolves deviceId → owner → pricing |
| `POST` | `/activate/send-otp` | `{ deviceId, phone }` | Send OTP to owner phone |
| `POST` | `/activate/:deviceId` | `{ phone, otp, displayName? }` | Verify OTP + activate gateway |
| `POST` | `/owner/:phone/pricing` | `{ prices: [...] }` | Shop owner sets per-configuration prices |
| `POST` | `/session` | `{ gatewayId }` | Create customer session, returns `{ id, sessionToken }` |
| `GET` | `/session/:token` | — | Get session state |

All responses: `{ ok: true, result: ... }` or `{ ok: false, error: { reason } }`.

### QR Code Resolution

```
QR → GET /gateway/{deviceId}

role: 'activation' → Show activation form (PRE_ACTIVATION)
role: 'customer'   → Show customer print UI (OPERATIONAL)
role: 'setup'      → Show "Gateway not ready" (ACTIVATED etc.)
role: 'unknown'    → Show "Invalid QR" (not found)
```