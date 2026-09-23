// ══════════════════════════════════════════════════════════════
// Channel Method Constants & Contract
// Single source of truth for ALL method names, args, success, and error
// shapes across ALL channels.
// ══════════════════════════════════════════════════════════════

import { Readable } from 'stream';

export const Methods = {
  // ── Gateway In_Req ──
  RequestPreFlight: 'requestPreFlight',
  RequestPrint: 'requestPrint',
  GetPrinterCapabilities: 'getPrinterCapabilities',

  // ── Gateway Out_Req ──
  RequestDeviceDetails: 'requestDeviceDetails',
  ValidateArtifactToken: 'validateArtifactToken',
  FetchArtifact: 'fetchArtifact',

  // ── Doc Store ──
  StoreArtifact: 'storeArtifact',
  GetArtifactStream: 'getArtifactStream',
  DeleteArtifact: 'deleteArtifact',
  ArtifactExists: 'artifactExists',

  // ── Data DB ──
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

  // ── Payment ──
  CreateOrder: 'createOrder',
  VerifyPayment: 'verifyPayment',
  GetPaymentStatus: 'getPaymentStatus',
  ProcessRefund: 'processRefund',

  // ── User Channel ──
  InitiateOwnerOtp: 'initiateOwnerOtp',
  ActivateGateway: 'activateGateway',
  SetShopPricing: 'setShopPricing',
  GetGatewayStatus: 'getGatewayStatus',
  GetOwnerInfo: 'getOwnerInfo',
  UploadDocument: 'uploadDocument',
  GetPricing: 'getPricing',
  GetSession: 'getSession',
  InitiateCheckout: 'initiateCheckout',
  ConfirmPayment: 'confirmPayment',
  GetJobStatus: 'getJobStatus',
} as const;

// ── Shared types referenced by contracts ──

export type PrinterInfo = {
  name: string;
  state: string;
  capabilities: {
    color: boolean;
    duplex: boolean;
    sizes: string[];
    maxCopies?: number;
  };
};

export type PrintDocument = {
  pageCount: number;
  color: boolean;
  duplex: boolean;
  paperSize: string;
  copies: number;
};

export type JobStatusValue = 'QUEUED' | 'PRINTING' | 'COMPLETED' | 'FAILED';

// ── Per-method contract shapes ──
// Each method defines { args, success, error }.
// Channels derive In_Req / Out_Resp / Out_Req / In_Resp from this.
// The Router uses this to type-check cross-channel routing.

export type Contract = {
  // ══════ Gateway In_Req ══════
  [Methods.RequestPreFlight]: {
    args: { deviceId: string; jobId: string; documents: PrintDocument[] };
    result: {};
    error: { reason: string };
  };
  [Methods.RequestPrint]: {
    args: { deviceId: string; jobId: string; artifactUrl: string; authToken: string; documents: PrintDocument[] };
    result: {};
    error: { reason: string };
  };
  [Methods.GetPrinterCapabilities]: {
    args: { deviceId: string };
    result: { printers: PrinterInfo[] };
    error: { reason: string };
  };

  // ══════ Gateway Out_Req ══════
  [Methods.RequestDeviceDetails]: {
    args: { deviceId: string };
    result: { deviceId: string; lifecycleState: string; deviceToken: string | null };
    error: { reason: string };
  };
  [Methods.ValidateArtifactToken]: {
    args: { jobId: string; authToken: string };
    result: { valid: boolean };
    error: { reason: string };
  };
  [Methods.FetchArtifact]: {
    args: { jobId: string };
    result: { stream: Readable; contentType: string; contentLength?: number };
    error: { reason: string };
  };

  // ══════ Doc Store ══════
  [Methods.StoreArtifact]: {
    args: { jobId: string; body: Readable; contentType: string; contentLength: number };
    result: { storageKey: string };
    error: { reason: string };
  };
  [Methods.GetArtifactStream]: {
    args: { storageKey: string };
    result: { stream: any; contentType: string; contentLength?: number };
    error: { reason: string };
  };
  [Methods.DeleteArtifact]: {
    args: { storageKey: string };
    result: {};
    error: { reason: string };
  };
  [Methods.ArtifactExists]: {
    args: { storageKey: string };
    result: { exists: boolean };
    error: { reason: string };
  };

  // ══════ Data DB ══════
  [Methods.GetOwnerByPhone]: {
    args: { phone: string };
    result: { phone?: string; displayName?: string | null };
    error: { reason: string };
  };
  [Methods.CreateOwner]: {
    args: { phone: string; displayName?: string };
    result: { phone: string; displayName?: string | null };
    error: { reason: string };
  };
  [Methods.PreRegisterDevice]: {
    args: { deviceId: string };
    result: { deviceId: string };
    error: { reason: string };
  };
  [Methods.GetGatewayByDeviceId]: {
    args: { deviceId: string };
    result: { deviceId: string; lifecycleState?: string; deviceToken?: string | null; ownerPhone?: string | null; name?: string | null } | null;
    error: { reason: string };
  };
  [Methods.UpdateGatewayState]: {
    args: { deviceId: string; lifecycleState: string; isConnected?: boolean; deviceToken?: string; ownerPhone?: string };
    result: { deviceId: string; lifecycleState: string };
    error: { reason: string };
  };
  [Methods.UpdateGatewayCapabilities]: {
    args: { deviceId: string; capabilities: Record<string, unknown> };
    result: { deviceId: string };
    error: { reason: string };
  };
  [Methods.ListGatewaysByOwner]: {
    args: { ownerPhone: string };
    result: { deviceId: string }[];
    error: { reason: string };
  };
  [Methods.SetPricing]: {
    args: { ownerPhone: string; pageType: string; pricePaise: number };
    result: { ownerPhone: string; pageType: string; pricePaise: number };
    error: { reason: string };
  };
  [Methods.GetPricingByOwner]: {
    args: { ownerPhone: string };
    result: { ownerPhone: string; pageType: string; pricePaise: number }[];
    error: { reason: string };
  };
  [Methods.CreateSession]: {
    args: { gatewayId: string; sessionToken: string; mode: string; expiresAt: Date };
    result: { id: string; sessionToken: string };
    error: { reason: string };
  };
  [Methods.GetSessionByToken]: {
    args: { token: string };
    result: { id: string; sessionToken: string; mode: string } | null;
    error: { reason: string };
  };
  [Methods.UpdateSessionAuth]: {
    args: { sessionId: string; phone: string; otpHash: string; otpExpiresAt: Date };
    result: { id: string };
    error: { reason: string };
  };
  [Methods.UpdateSessionState]: {
    args: { sessionId: string; state: string };
    result: { id: string };
    error: { reason: string };
  };
  [Methods.CreateDocument]: {
    args: { sessionToken: string; originalName: string; mimeType: string; storageKey: string; source: string; fileSize: number; pageCount?: number };
    result: { id: string };
    error: { reason: string };
  };
  [Methods.GetDocumentsBySession]: {
    args: { sessionToken: string };
    result: { id: string; originalName: string }[];
    error: { reason: string };
  };
  [Methods.CreatePrintJob]: {
    args: { jobNumber: string; gatewayId: string; sessionId: string; totalPages: number; pricePaise: number; documents: { documentId: string; pageCount: number; copies: number; color: boolean; duplex: boolean; paperSize: string; pricePaise: number }[] };
    result: { id: string; jobNumber: string };
    error: { reason: string };
  };
  [Methods.UpdateJobState]: {
    args: { jobId: string; state: string; errorReason?: string; artifactKey?: string };
    result: { id: string; state: string };
    error: { reason: string };
  };
  [Methods.GetPrintJob]: {
    args: { id: string; includeDocuments?: boolean };
    result: { id: string; state: string } | null;
    error: { reason: string };
  };
  [Methods.ListJobsByGateway]: {
    args: { gatewayId: string; state?: string };
    result: { id: string; state: string }[];
    error: { reason: string };
  };
  [Methods.CreatePayment]: {
    args: { jobId: string; amountPaise: number; provider: string };
    result: { id: string; status: string };
    error: { reason: string };
  };
  [Methods.UpdatePaymentStatus]: {
    args: { paymentId: string; status: string };
    result: { id: string; status: string };
    error: { reason: string };
  };
  [Methods.AuditLog]: {
    args: { entityType: string; entityId: string; event: string; fromState?: string; toState?: string };
    result: {};
    error: { reason: string };
  };
  [Methods.Ping]: {
    args: {};
    result: {};
    error: { reason: string };
  };
  [Methods.Stop]: {
    args: {};
    result: {};
    error: { reason: string };
  };

  // ══════ Payment ══════
  [Methods.CreateOrder]: {
    args: { amountPaise: number; currency?: string; receipt: string; notes?: Record<string, string> };
    result: { orderId: string; amountPaise: number; amountDue: number; status: string };
    error: { reason: string };
  };
  [Methods.VerifyPayment]: {
    args: { orderId: string; paymentId: string; signature: string };
    result: { verified: boolean };
    error: { reason: string };
  };
  [Methods.GetPaymentStatus]: {
    args: { paymentId: string };
    result: { paymentId: string; status: string; method?: string; amountPaise: number };
    error: { reason: string };
  };
  [Methods.ProcessRefund]: {
    args: { paymentId: string; amountPaise?: number };
    result: { refundId: string; status: string };
    error: { reason: string };
  };

  // ══════ User Channel ══════
  // Contracts to be refined — see docs/channel-user.md
  [Methods.InitiateOwnerOtp]: {
    args: { phone: string };
    result: { otpRef: string };
    error: { reason: string };
  };
  [Methods.ActivateGateway]: {
    args: { deviceId: string; phone: string; otp: string; displayName?: string };
    result: { deviceId: string; lifecycleState: string };
    error: { reason: string };
  };
  [Methods.SetShopPricing]: {
    args: { ownerPhone: string; pageType: string; pricePaise: number };
    result: {};
    error: { reason: string };
  };
  [Methods.GetGatewayStatus]: {
    args: { deviceId: string };
    result: { deviceId: string; lifecycleState: string; deviceToken?: string };
    error: { reason: string };
  };
  [Methods.GetOwnerInfo]: {
    args: { shopCode: string };
    result: { shopCode: string; shopName?: string; lifecycleState: string };
    error: { reason: string };
  };
  [Methods.UploadDocument]: {
    args: { sessionToken: string; fileName: string; mimeType: string; fileSize: number; body: Readable };
    result: { documentId: string; storageKey: string };
    error: { reason: string };
  };
  [Methods.GetPricing]: {
    args: { ownerPhone: string };
    result: { pricing: { pageType: string; pricePaise: number }[] };
    error: { reason: string };
  };
  [Methods.GetSession]: {
    args: { sessionToken: string };
    result: { sessionToken: string; mode: string; state: string };
    error: { reason: string };
  };
  [Methods.InitiateCheckout]: {
    args: { sessionToken: string; amountPaise: number };
    result: { orderId: string; amountPaise: number };
    error: { reason: string };
  };
  [Methods.ConfirmPayment]: {
    args: { sessionToken: string; orderId: string; paymentId: string; signature: string };
    result: { jobId: string; jobNumber: string };
    error: { reason: string };
  };
  [Methods.GetJobStatus]: {
    args: { jobId: string };
    result: { jobId: string; state: string };
    error: { reason: string };
  };
}