// ===== Payment Channel types =====
// Derives In_Req / Out_Resp from the shared Contract.

import { Methods, type Contract } from '../../shared/contracts/protocol';

type PaymentMethods =
  | typeof Methods.CreateOrder
  | typeof Methods.VerifyPayment
  | typeof Methods.GetPaymentStatus
  | typeof Methods.ProcessRefund;

export type In_Req = {
  [M in PaymentMethods]: { method: M; args: Contract[M]['args'] };
}[PaymentMethods];

export type Out_Resp = {
  [M in PaymentMethods]: { method: M; ok: true; result: Contract[M]['result'] } | { method: M; ok: false; error: Contract[M]['error'] };
}[PaymentMethods];

export { Methods } from '../../shared/contracts/protocol';