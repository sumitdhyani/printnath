import type { Owner, Gateway, CustomerSession, Document, PrintJob, JobDocument, Payment, Pricing } from '@prisma/client';

// ── Method constants ──

export const Methods = {
  GetOwnerByPhone: 'getOwnerByPhone',
  CreateOwner: 'createOwner',
  PreRegisterDevice: 'preRegisterDevice',
  GetGatewayByDeviceId: 'getGatewayByDeviceId',
  UpdateGatewayState: 'updateGatewayState',
  UpdateGatewayCapabilities: 'updateGatewayCapabilities',
  ListGatewaysByOwner: 'listGatewaysByOwner',
  SetPricing: 'setPricing',
  GetPricingByOwner: 'getPricingByOwner',
  CreateSession: 'createSession',
  GetSessionByToken: 'getSessionByToken',
  UpdateSessionAuth: 'updateSessionAuth',
  UpdateSessionState: 'updateSessionState',
  CreateDocument: 'createDocument',
  GetDocumentsBySession: 'getDocumentsBySession',
  CreatePrintJob: 'createPrintJob',
  UpdateJobState: 'updateJobState',
  GetPrintJob: 'getPrintJob',
  ListJobsByGateway: 'listJobsByGateway',
  CreatePayment: 'createPayment',
  UpdatePaymentStatus: 'updatePaymentStatus',
  AuditLog: 'auditLog',
  Ping: 'ping',
  Stop: 'stop',
} as const;

// ── Incoming requests ──

export type In_Req =
  | { method: typeof Methods.GetOwnerByPhone; args: { phone: string } }
  | { method: typeof Methods.CreateOwner; args: { phone: string; displayName?: string } }
  | { method: typeof Methods.PreRegisterDevice; args: { deviceId: string } }
  | { method: typeof Methods.GetGatewayByDeviceId; args: { deviceId: string } }
  | { method: typeof Methods.UpdateGatewayState; args: { deviceId: string; lifecycleState: string; isConnected?: boolean; deviceToken?: string } }
  | { method: typeof Methods.UpdateGatewayCapabilities; args: { deviceId: string; capabilities: Record<string, unknown> } }
  | { method: typeof Methods.ListGatewaysByOwner; args: { ownerPhone: string } }
  | { method: typeof Methods.SetPricing; args: { ownerPhone: string; pageType: string; pricePaise: number } }
  | { method: typeof Methods.GetPricingByOwner; args: { ownerPhone: string } }
  | { method: typeof Methods.CreateSession; args: { gatewayId: string; sessionToken: string; mode: string; expiresAt: Date } }
  | { method: typeof Methods.GetSessionByToken; args: { token: string } }
  | { method: typeof Methods.UpdateSessionAuth; args: { sessionId: string; phone: string; otpHash: string; otpExpiresAt: Date } }
  | { method: typeof Methods.UpdateSessionState; args: { sessionId: string; state: string } }
  | { method: typeof Methods.CreateDocument; args: { sessionToken: string; originalName: string; mimeType: string; storageKey: string; source: string; fileSize: number; pageCount?: number } }
  | { method: typeof Methods.GetDocumentsBySession; args: { sessionToken: string } }
  | { method: typeof Methods.CreatePrintJob; args: { jobNumber: string; gatewayId: string; sessionId: string; totalPages: number; pricePaise: number; documents: { documentId: string; pageCount: number; copies: number; color: boolean; duplex: boolean; paperSize: string; pricePaise: number }[] } }
  | { method: typeof Methods.GetPrintJob; args: { id: string; includeDocuments?: boolean } }
  | { method: typeof Methods.UpdateJobState; args: { jobId: string; state: string; errorReason?: string; artifactKey?: string } }
  | { method: typeof Methods.ListJobsByGateway; args: { gatewayId: string; state?: string } }
  | { method: typeof Methods.CreatePayment; args: { jobId: string; amountPaise: number; provider: string } }
  | { method: typeof Methods.UpdatePaymentStatus; args: { paymentId: string; status: string } }
  | { method: typeof Methods.AuditLog; args: { entityType: string; entityId: string; event: string; fromState?: string; toState?: string } }
  | { method: typeof Methods.Ping; args: {} }
  | { method: typeof Methods.Stop; args: {} };

// ── Outgoing responses ──

export type Out_Resp =
  | { method: typeof Methods.GetOwnerByPhone; ok: true; data: Owner | null }
  | { method: typeof Methods.CreateOwner; ok: true; data: Owner }
  | { method: typeof Methods.PreRegisterDevice; ok: true; data: Gateway }
  | { method: typeof Methods.GetGatewayByDeviceId; ok: true; data: Gateway | null }
  | { method: typeof Methods.UpdateGatewayState; ok: true; data: Gateway }
  | { method: typeof Methods.UpdateGatewayCapabilities; ok: true; data: Gateway }
  | { method: typeof Methods.ListGatewaysByOwner; ok: true; data: Gateway[] }
  | { method: typeof Methods.SetPricing; ok: true; data: Pricing }
  | { method: typeof Methods.GetPricingByOwner; ok: true; data: Pricing[] }
  | { method: typeof Methods.CreateSession; ok: true; data: CustomerSession }
  | { method: typeof Methods.GetSessionByToken; ok: true; data: CustomerSession | null }
  | { method: typeof Methods.UpdateSessionAuth; ok: true; data: CustomerSession }
  | { method: typeof Methods.UpdateSessionState; ok: true; data: CustomerSession }
  | { method: typeof Methods.CreateDocument; ok: true; data: Document }
  | { method: typeof Methods.GetDocumentsBySession; ok: true; data: Document[] }
  | { method: typeof Methods.CreatePrintJob; ok: true; data: PrintJob & { jobDocuments: JobDocument[] } }
  | { method: typeof Methods.UpdateJobState; ok: true; data: PrintJob }
  | { method: typeof Methods.GetPrintJob; ok: true; data: (PrintJob & { jobDocuments?: JobDocument[] }) | null }
  | { method: typeof Methods.ListJobsByGateway; ok: true; data: PrintJob[] }
  | { method: typeof Methods.CreatePayment; ok: true; data: Payment }
  | { method: typeof Methods.UpdatePaymentStatus; ok: true; data: Payment }
  | { method: typeof Methods.AuditLog; ok: true; data: null }
  | { method: typeof Methods.Ping; ok: true; data: null }
  | { method: typeof Methods.Stop; ok: true; data: null }
  | { method: string; ok: false; error: string };