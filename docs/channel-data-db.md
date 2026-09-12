# Data DB Channel

## Role

Persistence layer for structured data. All CRUD operations for customers, sessions, gateways, printers, pricing, documents, print jobs, payments, and audit log.

## Contract

### Init

```ts
type DataDbDeps = {
  config: { url: string };              // PostgreSQL connection string
  sendToRouter: (event: {              // Channel → Router events
    source: string;
    type: string;
    payload: unknown;
  }) => Promise<void>;
};

type DataDbChannel = {
  execute(req: In_Req): Promise<Out_Resp>;
  stop(): Promise<void>;
};
```

### Request (In_Req)

| Method | Args | Description |
|---|---|---|
| `getOwnerByPhone` | `{ phone }` | Lookup owner |
| `createOwner` | `{ phone, displayName? }` | Register owner |
| `preRegisterDevice` | `{ deviceId }` | Create device before shipping |
| `getGatewayByDeviceId` | `{ deviceId }` | Lookup gateway |
| `updateGatewayState` | `{ deviceId, lifecycleState, isConnected?, deviceToken? }` | Transition lifecycle |
| `updateGatewayCapabilities` | `{ deviceId, capabilities }` | Store printer capabilities |
| `listGatewaysByOwner` | `{ ownerPhone }` | All gateways for an owner |
| `setPricing` | `{ ownerPhone, pageType, pricePaise }` | Upsert page pricing |
| `getPricingByOwner` | `{ ownerPhone }` | All pricing for owner |
| `createSession` | `{ gatewayId, sessionToken, mode, expiresAt }` | New customer session |
| `getSessionByToken` | `{ token }` | Lookup session |
| `updateSessionAuth` | `{ sessionId, phone, otpHash, otpExpiresAt }` | Store OTP data |
| `updateSessionState` | `{ sessionId, state }` | Transition session state |
| `createDocument` | `{ sessionToken, originalName, mimeType, storageKey, source, fileSize, pageCount? }` | Store doc metadata |
| `getDocumentsBySession` | `{ sessionToken }` | Docs for a session |
| `createPrintJob` | `{ jobNumber, gatewayId, sessionId, totalPages, pricePaise, documents[] }` | Create job with per-doc config |
| `updateJobState` | `{ jobId, state, errorReason?, artifactKey? }` | Transition job state |
| `getPrintJob` | `{ id, includeDocuments? }` | Lookup job |
| `listJobsByGateway` | `{ gatewayId, state? }` | Jobs for a gateway |
| `createPayment` | `{ jobId, amountPaise, provider }` | Record payment |
| `updatePaymentStatus` | `{ paymentId, status }` | Update payment result |
| `auditLog` | `{ entityType, entityId, event, fromState?, toState? }` | Immutable log entry |
| `ping` | `{}` | Health check |
| `stop` | `{}` | Disconnect and shutdown |

### Response (Out_Resp)

Every successful response includes `method` matching the request and `ok: true` with typed data. Errors return `{ method, ok: false, error }`.

| Method | Response data |
|---|---|
| `getOwnerByPhone` | `Owner \| null` |
| `createOwner` | `Owner` |
| `preRegisterDevice` | `Gateway` |
| `getGatewayByDeviceId` | `Gateway \| null` |
| `updateGatewayState` | `Gateway` |
| `updateGatewayCapabilities` | `Gateway` |
| `listGatewaysByOwner` | `Gateway[]` |
| `setPricing` | `Pricing` |
| `getPricingByOwner` | `Pricing[]` |
| `createSession` | `CustomerSession` |
| `getSessionByToken` | `CustomerSession \| null` |
| `updateSessionAuth` | `CustomerSession` |
| `updateSessionState` | `CustomerSession` |
| `createDocument` | `Document` |
| `getDocumentsBySession` | `Document[]` |
| `createPrintJob` | `PrintJob & { jobDocuments: JobDocument[] }` |
| `updateJobState` | `PrintJob` |
| `getPrintJob` | `(PrintJob & { jobDocuments?: JobDocument[] }) \| null` |
| `listJobsByGateway` | `PrintJob[]` |
| `createPayment` | `Payment` |
| `updatePaymentStatus` | `Payment` |
| `auditLog` | `null` |
| `ping` | `null` |

## Dependencies

- **PostgreSQL** — database
- **Prisma** — ORM, schema, migrations

## State Machines

This channel does not execute state machines. It stores state machine transitions. The XState machines live in `@printnath/shared` and are executed by the router layer.

## Data Consistency

See [data_consistency_notes.md](data_consistency_notes.md) for known limitations (payment ↔ job state sync, orphan sessions).

## Tests

See [channel-tests/data-db/data-db.test.ts](../channel-tests/data-db/data-db.test.ts).