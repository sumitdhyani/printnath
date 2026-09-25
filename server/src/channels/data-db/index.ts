import { PrismaClient, type PageColor, type PageDuplex, type PaperSize } from '@prisma/client';
import { In_Req, Out_Resp } from './types';
import { Methods } from '../../shared/contracts/protocol';

export type DataDbChannel = {
  execute(req: In_Req): Promise<Out_Resp>;
  stop(): Promise<void>;
};

export type DataDbDeps = {
  config: { url: string };
};

export async function initDataDb(deps: DataDbDeps): Promise<DataDbChannel> {
  const prisma = new PrismaClient({ datasourceUrl: deps.config.url });
  await prisma.$connect();

  async function execute(req: In_Req): Promise<Out_Resp> {
    const r = req as any; // TS can't narrow imported Methods in switch

    // ── Pricing helpers (hoisted to function scope, avoid TDZ in switch) ──
    function parsePageType(s: string): { color: string; duplex: string; paperSize: string } {
      const minParts: number = 3;
      const parts = s.split(':');
      if (parts.length < minParts || parts.filter((part) => part.length === 0).length) {
        throw new Error(`Invalid price param: ${s}, should have atleast ${minParts} parts and all parts should be non-empty`);
      }
      return { color: parts[0], duplex: parts[1], paperSize: parts[2] };
    }

    function joinPageType(data: { color: string; duplex: string; paperSize: string }): string {
      return [data.color, data.duplex, data.paperSize].join(':');
    }

    try {
      switch (r.method) {
        // ── Owner ──
        case Methods.GetOwnerByPhone: {
          const data = await prisma.owner.findUnique({ where: { phone: r.args.phone } });
          return { method: Methods.GetOwnerByPhone, ok: true, result: data as any };
        }
        case Methods.CreateOwner: {
          const data = await prisma.owner.create({
            data: { phone: r.args.phone, displayName: r.args.displayName ?? null },
          });
          return { method: Methods.CreateOwner, ok: true, result: data };
        }

        // ── Gateway ──
        case Methods.PreRegisterDevice: {
          const data = await prisma.gateway.create({
            data: { deviceId: r.args.deviceId },
          });
          return { method: Methods.PreRegisterDevice, ok: true, result: data };
        }
        case Methods.GetGatewayByDeviceId: {
          const data = await prisma.gateway.findUnique({ where: { deviceId: r.args.deviceId } });
          return { method: Methods.GetGatewayByDeviceId, ok: true, result: data };
        }
        case Methods.UpdateGatewayState: {
          const data = await prisma.gateway.update({
            where: { deviceId: r.args.deviceId },
            data: {
              lifecycleState: r.args.lifecycleState,
              ...(r.args.isConnected !== undefined ? { isConnected: r.args.isConnected } : {}),
              ...(r.args.deviceToken ? { deviceToken: r.args.deviceToken } : {}),
              ...(r.args.lifecycleState === 'OPERATIONAL' ? { lastHeartbeat: new Date() } : {}),
              ...(r.args.ownerPhone ? { ownerPhone: r.args.ownerPhone } : {}),
            },
          });
          return { method: Methods.UpdateGatewayState, ok: true, result: data };
        }
        case Methods.ListGatewaysByOwner: {
          const data = await prisma.gateway.findMany({ where: { ownerPhone: r.args.ownerPhone } });
          return { method: Methods.ListGatewaysByOwner, ok: true, result: data };
        }
        case Methods.UpdateGatewayCapabilities: {
          const data = await prisma.gateway.update({
            where: { deviceId: r.args.deviceId },
            data: { capabilities: r.args.capabilities as object },
          });
          return { method: Methods.UpdateGatewayCapabilities, ok: true, result: data };
        }

        // ── Pricing ──

        case Methods.SetPricing: {
          const parsed = parsePageType(r.args.pageType);
          const data = await prisma.pricing.upsert({
            where: {
              ownerPhone_color_duplex_paperSize: {
                ownerPhone: r.args.ownerPhone,
                color: parsed.color as PageColor,
                duplex: parsed.duplex as PageDuplex,
                paperSize: parsed.paperSize as PaperSize,
              },
            },
            create: {
              ownerPhone: r.args.ownerPhone,
              color: parsed.color as PageColor,
              duplex: parsed.duplex as PageDuplex,
              paperSize: parsed.paperSize as PaperSize,
              pricePaise: r.args.pricePaise,
            },
            update: { pricePaise: r.args.pricePaise },
          });
          return {
            method: Methods.SetPricing,
            ok: true,
            result: { ownerPhone: data.ownerPhone, pageType: joinPageType(data), pricePaise: data.pricePaise },
          };
        }
        case Methods.GetPricingByOwner: {
          const data = await prisma.pricing.findMany({ where: { ownerPhone: r.args.ownerPhone, isActive: true } });
          return {
            method: Methods.GetPricingByOwner,
            ok: true,
            result: data.map(d => ({ ownerPhone: d.ownerPhone, pageType: joinPageType(d), pricePaise: d.pricePaise })),
          };
        }

        // ── Session ──
        case Methods.CreateSession: {
          const data = await prisma.customerSession.create({
            data: {
              gatewayId: r.args.gatewayId,
              sessionToken: r.args.sessionToken,
              mode: r.args.mode,
              expiresAt: r.args.expiresAt,
            },
          });
          return { method: Methods.CreateSession, ok: true, result: data };
        }
        case Methods.GetSessionByToken: {
          const data = await prisma.customerSession.findFirst({ where: { sessionToken: r.args.token, expiresAt: { gt: new Date() } } });
          return { method: Methods.GetSessionByToken, ok: true, result: data };
        }
        case Methods.UpdateSessionAuth: {
          const data = await prisma.customerSession.update({
            where: { id: r.args.sessionId },
            data: {
              phone: r.args.phone,
              otpHash: r.args.otpHash,
              otpExpiresAt: r.args.otpExpiresAt,
            },
          });
          return { method: Methods.UpdateSessionAuth, ok: true, result: data };
        }
        case Methods.UpdateSessionState: {
          const data = await prisma.customerSession.update({
            where: { id: r.args.sessionId },
            data: { state: r.args.state },
          });
          return { method: Methods.UpdateSessionState, ok: true, result: data };
        }
        case Methods.UpdateSessionMetadata: {
          const data = await prisma.customerSession.update({
            where: { id: r.args.sessionId },
            data: { metadata: r.args.metadata },
          });
          return { method: Methods.UpdateSessionMetadata, ok: true, result: data };
        }

        // ── Document ──
        case Methods.CreateDocument: {
          const data = await prisma.document.create({
            data: {
              sessionToken: r.args.sessionToken,
              originalName: r.args.originalName,
              mimeType: r.args.mimeType,
              storageKey: r.args.storageKey,
              source: r.args.source,
              fileSize: r.args.fileSize,
              pageCount: r.args.pageCount ?? null,
            },
          });
          return { method: Methods.CreateDocument, ok: true, result: data };
        }
        case Methods.GetDocumentsBySession: {
          const data = await prisma.document.findMany({ where: { sessionToken: r.args.sessionToken } });
          return { method: Methods.GetDocumentsBySession, ok: true, result: data };
        }

        // ── Print Job ──
        case Methods.CreatePrintJob: {
          const data = await prisma.printJob.create({
            data: {
              jobNumber: r.args.jobNumber,
              gatewayId: r.args.gatewayId,
              sessionId: r.args.sessionId,
              totalPages: r.args.totalPages,
              pricePaise: r.args.pricePaise,
              jobDocuments: {
                create: r.args.documents.map((d: Record<string, unknown>) => ({
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
          return { method: Methods.CreatePrintJob, ok: true, result: data };
        }
        case Methods.UpdateJobState: {
          const data = await prisma.printJob.update({
            where: { id: r.args.jobId },
            data: {
              state: r.args.state,
              ...(r.args.errorReason ? { errorReason: r.args.errorReason } : {}),
              ...(r.args.artifactKey ? { artifactKey: r.args.artifactKey } : {}),
            },
          });
          return { method: Methods.UpdateJobState, ok: true, result: data };
        }
        case Methods.GetPrintJob: {
          const data = await prisma.printJob.findUnique({
            where: { id: r.args.id },
            include: r.args.includeDocuments ? { jobDocuments: true } : undefined,
          });
          return { method: Methods.GetPrintJob, ok: true, result: data };
        }
        case Methods.ListJobsByGateway: {
          const where: Record<string, unknown> = { gatewayId: r.args.gatewayId };
          if (r.args.state) where.state = r.args.state;
          const data = await prisma.printJob.findMany({ where: where as any });
          return { method: Methods.ListJobsByGateway, ok: true, result: data };
        }

        // ── Payment ──
        case Methods.CreatePayment: {
          const data = await prisma.payment.create({
            data: {
              jobId: r.args.jobId,
              amountPaise: r.args.amountPaise,
              provider: r.args.provider,
            },
          });
          return { method: Methods.CreatePayment, ok: true, result: data };
        }
        case Methods.UpdatePaymentStatus: {
          const data = await prisma.payment.update({
            where: { id: r.args.paymentId },
            data: { status: r.args.status },
          });
          return { method: Methods.UpdatePaymentStatus, ok: true, result: data };
        }

        // ── Audit ──
        case Methods.AuditLog: {
          await prisma.auditLog.create({
            data: {
              entityType: r.args.entityType,
              entityId: r.args.entityId,
              event: r.args.event,
              fromState: r.args.fromState ?? null,
              toState: r.args.toState ?? null,
            },
          });
          return { method: Methods.AuditLog, ok: true, result: null as any };
        }

        // ── Lifecycle ──
        case Methods.Ping:
          return { method: Methods.Ping, ok: true, result: null as any };
        case Methods.Stop:
          await prisma.$disconnect();
          return { method: Methods.Stop, ok: true, result: null as any };

        default: { // keep req as never check
          throw new Error(`Unhandled method: ${(r as any).method}`);
        }
      }
    } catch (err) {
      return { method: r.method, ok: false, error: { reason: err instanceof Error ? err.message : String(err) } };
    }
  }

  return { execute, stop: async () => { await prisma.$disconnect(); } };
}