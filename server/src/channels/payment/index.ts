import crypto from 'crypto';
import { In_Req, Out_Resp } from './types';
import { Methods } from '../../shared/contracts/protocol';

export type PaymentChannel = {
  execute(req: In_Req): Promise<Out_Resp>;
  stop(): Promise<void>;
};

export type PaymentDeps = {
  config: {
    keyId: string;
    keySecret: string;
  };
};

const RAZORPAY_API = 'https://api.razorpay.com/v1';

export async function initPayment(deps: PaymentDeps): Promise<PaymentChannel> {
  const auth = Buffer.from(`${deps.config.keyId}:${deps.config.keySecret}`).toString('base64');

  async function razorpayFetch(method: string, path: string, body?: unknown): Promise<any> {
    const res = await fetch(`${RAZORPAY_API}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err: any = await res.json().catch(() => ({}));
      throw new Error(err.error?.description ?? `Razorpay ${res.status}: ${res.statusText}`);
    }
    return res.json();
  }

  async function execute(req: In_Req): Promise<Out_Resp> {
    try {
      switch (req.method) {
        // ── Create Order ──
        case Methods.CreateOrder: {
          const order = await razorpayFetch('POST', '/orders', {
            amount: req.args.amountPaise,
            currency: req.args.currency ?? 'INR',
            receipt: req.args.receipt,
            notes: req.args.notes,
          });
          return {
            method: Methods.CreateOrder, ok: true,
            result: { orderId: order.id, amountPaise: order.amount, amountDue: order.amount_due, status: order.status },
          };
        }

        // ── Verify Payment ──
        case Methods.VerifyPayment: {
          const body = `${req.args.orderId}|${req.args.paymentId}`;
          const expectedSig = crypto.createHmac('sha256', deps.config.keySecret).update(body).digest('hex');
          const verified = expectedSig === req.args.signature;
          return { method: Methods.VerifyPayment, ok: true, result: { verified } };
        }

        // ── Get Payment Status ──
        case Methods.GetPaymentStatus: {
          const payment = await razorpayFetch('GET', `/payments/${req.args.paymentId}`);
          return {
            method: Methods.GetPaymentStatus, ok: true,
            result: {
              paymentId: payment.id,
              status: payment.status,
              method: payment.method ?? undefined,
              amountPaise: payment.amount,
            },
          };
        }

        // ── Process Refund ──
        case Methods.ProcessRefund: {
          const refund = await razorpayFetch('POST', `/payments/${req.args.paymentId}/refund`, {
            ...(req.args.amountPaise !== undefined ? { amount: req.args.amountPaise } : {}),
          });
          return {
            method: Methods.ProcessRefund, ok: true,
            result: { refundId: refund.id, status: refund.status },
          };
        }

        default: {
          const _exhaustive: never = req;
          throw new Error(`Unhandled: ${(_exhaustive as any)?.method}`);
        }
      }
    } catch (err) {
      return { method: req.method, ok: false, error: { reason: err instanceof Error ? err.message : String(err) } };
    }
  }

  return {
    execute,
    stop: async () => {},
  };
}