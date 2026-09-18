import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { initPayment, type PaymentChannel, type PaymentDeps } from '../../server/src/channels/payment/index';
import { Methods } from '../../server/src/channels/payment/types';
import crypto from 'crypto';
import { Contract } from '../../server/src/shared/contracts/protocol';

// ── Mocks ──

const FAKE_KEY_ID = 'rzp_test_key';
const FAKE_KEY_SECRET = 'fake-secret';

function createDeps(): PaymentDeps {
  return { config: { keyId: FAKE_KEY_ID, keySecret: FAKE_KEY_SECRET } };
}

// ── Tests ──

describe('Payment channel', () => {
  let channel: PaymentChannel;

  beforeEach(async () => {
    channel = await initPayment(createDeps());
  });

  afterEach(async () => {
    await channel.stop();
    vi.unstubAllGlobals();
  });

  // ══════════════════════════════════════════════════════════════
  // CreateOrder
  // ══════════════════════════════════════════════════════════════

  describe('CreateOrder', () => {
    /*
     * Router                          Payment Channel          Razorpay API
     *   │                                    │                      │
     *   │ execute(CreateOrder)               │                      │
     *   │ { amountPaise, receipt }           │                      │
     *   │───────────────────────────────────→│                      │
     *   │                                    │ POST /v1/orders     │
     *   │                                    │─────────────────────→│
     *   │                                    │ ← { id, amount,     │
     *   │                                    │     amount_due,     │
     *   │                                    │     status }        │
     *   │                                    │                      │
     *   │ ← { ok: true,                     │                      │
     *   │     result: { orderId,             │                      │
     *   │              amountPaise,          │                      │
     *   │              amountDue, status } } │                      │
     *   │←───────────────────────────────────│                      │
     */
    test('creates Razorpay order and returns mapped result', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'order_abc123',
          amount: 50000,
          amount_due: 50000,
          amount_paid: 0,
          status: 'created',
          currency: 'INR',
          receipt: 'receipt-001',
          created_at: 1700000000,
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const resp = await channel.execute({
        method: Methods.CreateOrder,
        args: { amountPaise: 50000, receipt: 'receipt-001' },
      });

      expect(resp.ok).toBe(true);
      if (!resp.ok) return;
      const result = resp.result as Contract[typeof Methods.CreateOrder]["result"];
      expect(result.orderId).toBe('order_abc123');
      expect(result.amountPaise).toBe(50000);
      expect(result.amountDue).toBe(50000);
      expect(result.status).toBe('created');
    });

    test('Razorpay error returns ok:false', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false, status: 400,
        json: () => Promise.resolve({ error: { description: 'Amount must be greater than zero' } }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await channel.execute({
        method: Methods.CreateOrder,
        args: { amountPaise: 0, receipt: 'bad-receipt' },
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.reason).toContain('Amount must be greater than zero');
          });
  });

  // ══════════════════════════════════════════════════════════════
  // VerifyPayment
  // ══════════════════════════════════════════════════════════════

  describe('VerifyPayment', () => {
    /*
     * Router                          Payment Channel
     *   │                                    │
     *   │ execute(VerifyPayment)              │
     *   │ { orderId, paymentId, signature }   │
     *   │───────────────────────────────────→│
     *   │                                    │
     *   │  HMAC SHA256(orderId|paymentId)     │
     *   │  compare with signature             │
     *   │                                    │
     *   │ ← { ok: true,                     │
     *   │     result: { verified: true/false }│
     *   │←───────────────────────────────────│
     */
    test('valid signature returns verified:true', async () => {
      const orderId = 'order_abc';
      const paymentId = 'pay_def';
      const body = `${orderId}|${paymentId}`;
      const signature = crypto.createHmac('sha256', FAKE_KEY_SECRET).update(body).digest('hex');

      const resp = await channel.execute({
        method: Methods.VerifyPayment,
        args: { orderId, paymentId, signature },
      });

      expect(resp.ok).toBe(true);
      if (!resp.ok) return;
      const result = resp.result as Contract[typeof Methods.VerifyPayment]["result"]; 
      expect(result.verified).toBe(true);
    });

    test('invalid signature returns verified:false', async () => {
      const resp = await channel.execute({
        method: Methods.VerifyPayment,
        args: { orderId: 'order_x', paymentId: 'pay_y', signature: 'tampered-signature' },
      });

      expect(resp.ok).toBe(true);
      if (!resp.ok) return;

      const result = resp.result as Contract[typeof Methods.VerifyPayment]["result"]; 
      expect(result.verified).toBe(false);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // GetPaymentStatus
  // ══════════════════════════════════════════════════════════════

  describe('GetPaymentStatus', () => {
    test('fetches payment status from Razorpay', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'pay_xyz',
          status: 'captured',
          method: 'upi',
          amount: 10000,
          currency: 'INR',
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await channel.execute({
        method: Methods.GetPaymentStatus,
        args: { paymentId: 'pay_xyz' },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.result.paymentId).toBe('pay_xyz');
      expect(result.result.status).toBe('captured');
      expect(result.result.method).toBe('upi');
      expect(result.result.amountPaise).toBe(10000);
          });
  });

  // ══════════════════════════════════════════════════════════════
  // ProcessRefund
  // ══════════════════════════════════════════════════════════════

  describe('ProcessRefund', () => {
    test('full refund returns refundId', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'rfnd_abc',
          status: 'processed',
          amount: 10000,
          payment_id: 'pay_xyz',
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await channel.execute({
        method: Methods.ProcessRefund,
        args: { paymentId: 'pay_xyz' },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.result.refundId).toBe('rfnd_abc');
      expect(result.result.status).toBe('processed');
          });

    test('partial refund with amountPaise', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'rfnd_partial',
          status: 'processed',
          amount: 5000,
          payment_id: 'pay_xyz',
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await channel.execute({
        method: Methods.ProcessRefund,
        args: { paymentId: 'pay_xyz', amountPaise: 5000 },
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.result.refundId).toBe('rfnd_partial');

      // Verify amount was sent in request body
      const reqBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(reqBody.amount).toBe(5000);
          });
  });

  // ══════════════════════════════════════════════════════════════
  // Unhandled method
  // ══════════════════════════════════════════════════════════════

  describe('unhandled method', () => {
    test('returns error for unknown method', async () => {
      const result = await channel.execute({ method: 'unknownMethod' as any, args: {} } as any);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.reason).toContain('Unhandled');
    });
  });
});