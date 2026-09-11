import type { Owner, Gateway, CustomerSession, Document, PrintJob, Payment, Printer, Pricing } from '@prisma/client';
import { Brand } from '@printnath/shared';
 
export type In_Req =
  // Owner
  | { method: 'getOwnerByPhone'; args: { phone: string } }
  | { method: 'createOwner'; args: { phone: string; displayName?: string } }
  // Gateway
  | { method: 'preRegisterDevice'; args: { deviceId: string } }
  | { method: 'getGatewayByDeviceId'; args: { deviceId: string } }
  | { method: 'updateGatewayState'; args: { deviceId: string; lifecycleState: string; isConnected?: boolean; deviceToken?: string } }
  | { method: 'listGatewaysByOwner'; args: { ownerPhone: string } }
  // Printer
  | { method: 'upsertPrinter'; args: { gatewayId: string; name: string; state: string; type?: string } }
  | { method: 'updatePrinterState'; args: { printerId: string; state: string } }
  // Pricing
  | { method: 'setPricing'; args: { ownerPhone: string; pageType: string; pricePaise: number } }
  | { method: 'getPricingByOwner'; args: { ownerPhone: string } }
  // Session
  | { method: 'createSession'; args: { gatewayId: string; sessionToken: string; mode: string; expiresAt: Date } }
  | { method: 'getSessionByToken'; args: { token: string } }
  | { method: 'updateSessionAuth'; args: { sessionId: string; phone: string; otpHash: string; otpExpiresAt: Date } }
  | { method: 'updateSessionState'; args: { sessionId: string; state: string } }
  // Document
  | { method: 'createDocument'; args: { sessionToken: string; originalName: string; mimeType: string; storageKey: string; source: string; fileSize: number; pageCount?: number } }
  | { method: 'getDocumentsBySession'; args: { sessionToken: string } }
  // Print Job
  | { method: 'createPrintJob'; args: { jobNumber: string; gatewayId: string; sessionId: string; totalPages: number; pricePaise: number; requirements: Record<string, unknown> } }
  | { method: 'updateJobState'; args: { jobId: string; state: string; errorReason?: string; artifactKey?: string } }
  | { method: 'getPrintJob'; args: { id: string } }
  | { method: 'listJobsByGateway'; args: { gatewayId: string; state?: string } }
  // Payment
  | { method: 'createPayment'; args: { jobId: string; amountPaise: number; provider: string } }
  | { method: 'updatePaymentStatus'; args: { paymentId: string; status: string } }
  // Audit
  | { method: 'auditLog'; args: { entityType: string; entityId: string; event: string; fromState?: string; toState?: string } }
  // Lifecycle
  | { method: 'ping' }
  | { method: 'stop' };

export type Out_Resp =
  Brand<{ ok: true; data: Owner | null }, "">
  | { ok: true; data: Owner }
  | { ok: true; data: Gateway | null }
  | { ok: true; data: Gateway }
  | { ok: true; data: Gateway[] }
  | { ok: true; data: Printer }
  | { ok: true; data: Pricing }
  | { ok: true; data: Pricing[] }
  | { ok: true; data: CustomerSession }
  | { ok: true; data: CustomerSession | null }
  | { ok: true; data: Document }
  | { ok: true; data: Document[] }
  | { ok: true; data: PrintJob | null }
  | { ok: true; data: PrintJob }
  | { ok: true; data: PrintJob[] }
  | { ok: true; data: Payment | null }
  | { ok: true; data: null }
  | { ok: false; error: string };