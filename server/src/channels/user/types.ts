// ===== User Channel types =====
// Derives Out_Req / In_Resp from the shared Contract.

export type { PrinterInfo } from "../../shared/contracts/protocol";
export { Methods, type Contract } from "../../shared/contracts/protocol";
import { Methods, type Contract } from '../../shared/contracts/protocol';

// ── User channel method subset ──

type UserOutMethods =
  // User channel orchestration methods
  | typeof Methods.InitiateOwnerOtp
  | typeof Methods.ActivateGateway
  | typeof Methods.SetShopPricing
  | typeof Methods.UploadDocument
  | typeof Methods.InitiateCheckout
  | typeof Methods.ConfirmPayment
  // Downstream data-db methods
  | typeof Methods.GetGatewayByDeviceId
  | typeof Methods.GetOwnerByPhone
  | typeof Methods.CreateOwner
  | typeof Methods.UpdateGatewayState
  | typeof Methods.SetPricing
  | typeof Methods.GetPricingByOwner
  | typeof Methods.GetSessionByToken
  | typeof Methods.CreateSession
  | typeof Methods.CreateDocument
  | typeof Methods.CreatePrintJob
  | typeof Methods.GetPrintJob
  | typeof Methods.CreatePayment
  | typeof Methods.UpdateSessionMetadata
  // Downstream gateway methods
  | typeof Methods.GetPrinterCapabilities
  | typeof Methods.RequestPreFlight
  | typeof Methods.RequestPrint
  // Downstream doc-store methods
  | typeof Methods.StoreArtifact
  // Downstream payment methods
  | typeof Methods.CreateOrder
  | typeof Methods.VerifyPayment;

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