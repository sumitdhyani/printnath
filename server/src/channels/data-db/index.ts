import { PrismaClient } from '@prisma/client';
import { Methods, type In_Req, type Out_Resp } from './types';

export type DataDbChannel = {
  execute(req: In_Req): Promise<Out_Resp>;
  stop(): Promise<void>;
};

export type DataDbDeps = {
  config: { url: string };
  sendToRouter: (resp: Out_Resp) => Promise<void>;
};

export async function initDataDb(deps: DataDbDeps): Promise<DataDbChannel> {
  const prisma = new PrismaClient({ datasourceUrl: deps.config.url });
  await prisma.$connect();

  async function execute(req: In_Req): Promise<Out_Resp> {
    try {
      switch (req.method) {
        // ── Owner ──
        case Methods.GetOwnerByPhone: {
          const data = await prisma.owner.findUnique({ where: { phone: req.args.phone } });
          return { method: Methods.GetOwnerByPhone, ok: true, data };
        }
        case Methods.CreateOwner: {
          const data = await prisma.owner.create({
            data: { phone: req.args.phone, displayName: req.args.displayName ?? null },
          });
          return { method: Methods.CreateOwner, ok: true, data };
        }

        // ── Gateway ──
        case Methods.PreRegisterDevice: {
          const data = await prisma.gateway.create({
            data: { deviceId: req.args.deviceId },
          });
          return { method: Methods.PreRegisterDevice, ok: true, data };
        }
        case Methods.GetGatewayByDeviceId: {
          const data = await prisma.gateway.findUnique({ where: { deviceId: req.args.deviceId } });
          return { method: Methods.GetGatewayByDeviceId, ok: true, data };
        }
        case Methods.UpdateGatewayState: {
          const data = await prisma.gateway.update({
            where: { deviceId: req.args.deviceId },
            data: {
              lifecycleState: req.args.lifecycleState,
              ...(req.args.isConnected !== undefined ? { isConnected: req.args.isConnected } : {}),
              ...(req.args.deviceToken ? { deviceToken: req.args.deviceToken } : {}),
              ...(req.args.lifecycleState === 'OPERATIONAL' ? { lastHeartbeat: new Date() } : {}),
            },
          });
          return { method: Methods.UpdateGatewayState, ok: true, data };
        }
        case Methods.ListGatewaysByOwner: {
          const data = await prisma.gateway.findMany({ where: { ownerPhone: req.args.ownerPhone } });
          return { method: Methods.ListGatewaysByOwner, ok: true, data };
        }
        case Methods.UpdateGatewayCapabilities: {
          const data = await prisma.gateway.update({
            where: { deviceId: req.args.deviceId },
            data: { capabilities: req.args.capabilities as object },
          });
          return { method: Methods.UpdateGatewayCapabilities, ok: true, data };
        }

        // ── Pricing ──
        case Methods.SetPricing: {
          const data = await prisma.pricing.upsert({
            where: { ownerPhone_pageType: { ownerPhone: req.args.ownerPhone, pageType: req.args.pageType } },
            create: {
              ownerPhone: req.args.ownerPhone,
              pageType: req.args.pageType,
              pricePaise: req.args.pricePaise,
            },
            update: { pricePaise: req.args.pricePaise },
          });
          return { method: Methods.SetPricing, ok: true, data };
        }
        case Methods.GetPricingByOwner: {
          const data = await prisma.pricing.findMany({ where: { ownerPhone: req.args.ownerPhone, isActive: true } });
          return { method: Methods.GetPricingByOwner, ok: true, data };
        }

        // ── Session ──
        case Methods.CreateSession: {
          const data = await prisma.customerSession.create({
            data: {
              gatewayId: req.args.gatewayId,
              sessionToken: req.args.sessionToken,
              mode: req.args.mode,
              expiresAt: req.args.expiresAt,
            },
          });
          return { method: Methods.CreateSession, ok: true, data };
        }
        case Methods.GetSessionByToken: {
          const data = await prisma.customerSession.findUnique({ where: { sessionToken: req.args.token } });
          return { method: Methods.GetSessionByToken, ok: true, data };
        }
        case Methods.UpdateSessionAuth: {
          const data = await prisma.customerSession.update({
            where: { id: req.args.sessionId },
            data: {
              phone: req.args.phone,
              otpHash: req.args.otpHash,
              otpExpiresAt: req.args.otpExpiresAt,
            },
          });
          return { method: Methods.UpdateSessionAuth, ok: true, data };
        }
        case Methods.UpdateSessionState: {
          const data = await prisma.customerSession.update({
            where: { id: req.args.sessionId },
            data: { state: req.args.state },
          });
          return { method: Methods.UpdateSessionState, ok: true, data };
        }

        // ── Document ──
        case Methods.CreateDocument: {
          const data = await prisma.document.create({
            data: {
              sessionToken: req.args.sessionToken,
              originalName: req.args.originalName,
              mimeType: req.args.mimeType,
              storageKey: req.args.storageKey,
              source: req.args.source,
              fileSize: req.args.fileSize,
              pageCount: req.args.pageCount ?? null,
            },
          });
          return { method: Methods.CreateDocument, ok: true, data };
        }
        case Methods.GetDocumentsBySession: {
          const data = await prisma.document.findMany({ where: { sessionToken: req.args.sessionToken } });
          return { method: Methods.GetDocumentsBySession, ok: true, data };
        }

        // ── Print Job ──
        case Methods.CreatePrintJob: {
          const data = await prisma.printJob.create({
            data: {
              jobNumber: req.args.jobNumber,
              gatewayId: req.args.gatewayId,
              sessionId: req.args.sessionId,
              totalPages: req.args.totalPages,
              pricePaise: req.args.pricePaise,
              jobDocuments: {
                create: req.args.documents.map(d => ({
                  documentId: d.documentId,
                  pageCount: d.pageCount,
                  copies: d.copies,
                  color: d.color,
                  duplex: d.duplex,
                  paperSize: d.paperSize,
                  pricePaise: d.pricePaise,
                })),
              },
            },
            include: { jobDocuments: true },
          });
          return { method: Methods.CreatePrintJob, ok: true, data };
        }
        case Methods.UpdateJobState: {
          const data = await prisma.printJob.update({
            where: { id: req.args.jobId },
            data: {
              state: req.args.state,
              ...(req.args.errorReason ? { errorReason: req.args.errorReason } : {}),
              ...(req.args.artifactKey ? { artifactKey: req.args.artifactKey } : {}),
            },
          });
          return { method: Methods.UpdateJobState, ok: true, data };
        }
        case Methods.GetPrintJob: {
          const data = await prisma.printJob.findUnique({
            where: { id: req.args.id },
            include: req.args.includeDocuments ? { jobDocuments: true } : undefined,
          });
          return { method: Methods.GetPrintJob, ok: true, data };
        }
        case Methods.ListJobsByGateway: {
          const where: Record<string, unknown> = { gatewayId: req.args.gatewayId };
          if (req.args.state) where.state = req.args.state;
          const data = await prisma.printJob.findMany({ where: where as any });
          return { method: Methods.ListJobsByGateway, ok: true, data };
        }

        // ── Payment ──
        case Methods.CreatePayment: {
          const data = await prisma.payment.create({
            data: {
              jobId: req.args.jobId,
              amountPaise: req.args.amountPaise,
              provider: req.args.provider,
            },
          });
          return { method: Methods.CreatePayment, ok: true, data };
        }
        case Methods.UpdatePaymentStatus: {
          const data = await prisma.payment.update({
            where: { id: req.args.paymentId },
            data: { status: req.args.status },
          });
          return { method: Methods.UpdatePaymentStatus, ok: true, data };
        }

        // ── Audit ──
        case Methods.AuditLog: {
          await prisma.auditLog.create({
            data: {
              entityType: req.args.entityType,
              entityId: req.args.entityId,
              event: req.args.event,
              fromState: req.args.fromState ?? null,
              toState: req.args.toState ?? null,
            },
          });
          return { method: Methods.AuditLog, ok: true, data: null as unknown as null };
        }

        // ── Lifecycle ──
        case Methods.Ping:
          return { method: Methods.Ping, ok: true, data: null as unknown as null };
        case Methods.Stop:
          await prisma.$disconnect();
          return { method: Methods.Stop, ok: true, data: null as unknown as null };

        default: {
          const _exhaustive: never = req;
          throw new Error(`Unhandled method: ${(_exhaustive as any)?.method}`);
        }
      }
    } catch (err) {
      return { method: req.method, ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return { execute, stop: async () => { await prisma.$disconnect(); } };
}