// ===== Data DB Channel types =====
// Derives In_Req / Out_Resp from the shared Contract.

import { Methods, type Contract } from '../../shared/contracts/protocol';

// Explicit method list — keyof typeof Methods can't index Contract
type DbMethods =
  | typeof Methods.GetOwnerByPhone
  | typeof Methods.CreateOwner
  | typeof Methods.PreRegisterDevice
  | typeof Methods.GetGatewayByDeviceId
  | typeof Methods.UpdateGatewayState
  | typeof Methods.UpdateGatewayCapabilities
  | typeof Methods.ListGatewaysByOwner
  | typeof Methods.SetPricing
  | typeof Methods.GetPricingByOwner
  | typeof Methods.CreateSession
  | typeof Methods.GetSessionByToken
  | typeof Methods.UpdateSessionAuth
  | typeof Methods.UpdateSessionState
  | typeof Methods.CreateDocument
  | typeof Methods.GetDocumentsBySession
  | typeof Methods.CreatePrintJob
  | typeof Methods.UpdateJobState
  | typeof Methods.GetPrintJob
  | typeof Methods.ListJobsByGateway
  | typeof Methods.CreatePayment
  | typeof Methods.UpdatePaymentStatus
  | typeof Methods.AuditLog
  | typeof Methods.Ping
  | typeof Methods.Stop;

export type In_Req = {
  [M in DbMethods]: { method: M; args: Contract[M]['args'] };
}[DbMethods];

export type Out_Resp = {
  [M in DbMethods]: { method: M; ok: true; data: Contract[M]['result'] };
}[DbMethods] | { method: string; ok: false; error: string };

export { Methods } from '../../shared/contracts/protocol';