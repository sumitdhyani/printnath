# Payment Channel

## Role

Integrates with Razorpay payment gateway. Handles order creation, payment verification, status checks, and refunds. All payment provider details are encapsulated here — other channels never talk to Razorpay directly.

## Contract

### Init

```ts
type PaymentDeps = {
  config: {
    keyId: string;        // Razorpay Key ID
    keySecret: string;    // Razorpay Key Secret
  };
};

type PaymentChannel = {
  execute(req: In_Req): Promise<Out_Resp>;
  stop(): Promise<void>;
};
```

### Request (In_Req)

| Method | Args | Result | Description |
|--------|------|--------|-------------|
| `createOrder` | `{ amountPaise, currency?, receipt, notes? }` | `{ orderId, amountPaise, amountDue, status }` | Create Razorpay order |
| `verifyPayment` | `{ orderId, paymentId, signature }` | `{ verified }` | HMAC SHA256 signature check |
| `getPaymentStatus` | `{ paymentId }` | `{ paymentId, status, method?, amountPaise }` | Fetch payment from Razorpay |
| `processRefund` | `{ paymentId, amountPaise? }` | `{ refundId, status }` | Full or partial refund |

### Response (Out_Resp)

Success: `{ method: string; ok: true; result: Contract[M]['result'] }`
Error:   `{ method: string; ok: false; error: { reason: string } }`

## Implementation Details

### Razorpay HTTP API

Uses Node.js `fetch` (global, Node >= 18) with Basic Auth:

```
Authorization: Basic base64(keyId + ":" + keySecret)
Content-Type: application/json
```

### Payment Verification (VerifyPayment)

Razorpay sends a webhook with `x-razorpay-signature` header. The channel recomputes:

```
hmac_sha256(keySecret, "order_id|payment_id") == signature
```

If equal → `{ verified: true }`. Otherwise → `{ verified: false }`.

## Dependencies

- Node.js built-in `crypto` module (for HMAC)
- Node.js built-in `fetch` (for HTTP)
- No npm SDK dependencies

## Test Coverage

| Test | What it verifies |
|------|-----------------|
| Create: success | Mocks Razorpay response, checks mapped result fields |
| Create: Razorpay error | 400 response → `ok: false, error.reason` |
| Verify: valid signature | HMAC computed correctly → `verified: true` |
| Verify: invalid signature | Wrong sig → `verified: false` |
| GetPaymentStatus: success | Fetches payment, returns status/method/amount |
| Refund: full | Refund API called without amount → `refundId` returned |
| Refund: partial | Refund API called with `amount` in body → `refundId` returned |
| Unhandled method | Unknown method → `ok: false` |