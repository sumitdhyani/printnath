// ===== User Channel types =====
// Derives Out_Req / In_Resp from the shared Contract.

export type { PrinterInfo } from "../../shared/contracts/protocol";
export { Methods, type Contract } from "../../shared/contracts/protocol";
import { Methods, type Contract } from '../../shared/contracts/protocol';

// ── User channel method subset ──

type UserOutMethods =
  | typeof Methods.InitiateOwnerOtp
  | typeof Methods.ActivateGateway
  | typeof Methods.SetShopPricing
  | typeof Methods.GetGatewayStatus
  | typeof Methods.GetOwnerInfo
  | typeof Methods.UploadDocument
  | typeof Methods.GetPricing
  | typeof Methods.GetSession
  | typeof Methods.InitiateCheckout
  | typeof Methods.ConfirmPayment
  | typeof Methods.GetJobStatus;

// ── Derived types ──

export type Out_Req = {
  [M in UserOutMethods]: { method: M; args: Contract[M]['args'] };
}[UserOutMethods];

export type In_Resp = {
  [M in UserOutMethods]: { method: M; ok: true; result: Contract[M]["result"] } | { method: M; ok: false; error: Contract[M]["error"] };
}[UserOutMethods];

// ── Out_Us: events (fire-and-forget, no response) ──

export type Out_Us =
  | { event: 'USER_SESSION_CREATED'; payload: { sessionToken: string; gatewayId: string } }
  | { event: 'PAYMENT_COMPLETED'; payload: { jobId: string } }
  | { event: 'USER_ERROR'; payload: { sessionToken: string; error: string } };