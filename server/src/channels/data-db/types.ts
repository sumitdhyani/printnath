import type { Shop, CustomerSession, Document, PrintJob, Payment, Gateway, Printer, Pricing } from '@prisma/client';

export type In_Req =
  | { method: 'getShopByCode'; args: { code: string } }
  | { method: 'registerGateway'; args: { deviceId: string; softwareVer: string } }
  | { method: 'getGatewayByDeviceId'; args: { deviceId: string } }
  | { method: 'updateGatewayState'; args: { deviceId: string; lifecycleState: string; isConnected?: boolean } }
  | { method: 'upsertPrinter'; args: { gatewayId: string; name: string; state: string; type?: string } }
  | { method: 'getPricingByShop'; args: { shopId: string } }
  | { method: 'createSession'; args: { shopId: string; sessionToken: string; mode: string; expiresAt: Date } }
  | { method: 'getSessionByToken'; args: { token: string } }
  | { method: 'updateSessionAuth'; args: { sessionId: string; phone: string; otpHash: string; otpExpiresAt: Date } }
  | { method: 'updateSessionState'; args: { sessionId: string; state: string; mode?: string } }
  | { method: 'createDocument'; args: { sessionToken: string; originalName: string; mimeType: string; storageKey: string; source: string; fileSize: number; pageCount?: number } }
  | { method: 'getDocumentsBySession'; args: { sessionToken: string } }
  | { method: 'createPrintJob'; args: { jobNumber: string; shopId: string; sessionId: string; totalPages: number; pricePaise: number; requirements: Record<string, unknown> } }
  | { method: 'updateJobState'; args: { jobId: string; state: string; errorReason?: string; gatewayId?: string; artifactKey?: string } }
  | { method: 'getPrintJob'; args: { id: string } }
  | { method: 'createPayment'; args: { jobId: string; amountPaise: number; provider: string } }
  | { method: 'updatePaymentStatus'; args: { paymentId: string; status: string } }
  | { method: 'auditLog'; args: { entityType: string; entityId: string; event: string; fromState?: string; toState?: string } }
  | { method: 'ping' }
  | { method: 'stop' };

export type Out_Resp =
  | { ok: true; data: Shop }
  | { ok: true; data: Shop | null }
  | { ok: true; data: Gateway }
  | { ok: true; data: Gateway | null }
  | { ok: true; data: Printer }
  | { ok: true; data: Printer[] }
  | { ok: true; data: Pricing[] }
  | { ok: true; data: CustomerSession }
  | { ok: true; data: CustomerSession | null }
  | { ok: true; data: Document }
  | { ok: true; data: Document[] }
  | { ok: true; data: PrintJob }
  | { ok: true; data: PrintJob | null }
  | { ok: true; data: Payment }
  | { ok: true; data: Payment | null }
  | { ok: true; data: null }
  | { ok: false; error: string };