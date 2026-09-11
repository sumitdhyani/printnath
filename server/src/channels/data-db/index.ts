import { PrismaClient } from '@prisma/client';
import type { In_Req, Out_Resp } from './types';

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
        case 'getOwnerByPhone': {
          const data = await prisma.owner.findUnique({ where: { phone: req.args.phone } });
          return { ok: true, data };
        }
        case 'createOwner': {
          const data = await prisma.owner.create({
            data: { phone: req.args.phone, displayName: req.args.displayName ?? null },
          });
          return { ok: true, data };
        }

        // ── Gateway ──
        case 'preRegisterDevice': {
          const data = await prisma.gateway.create({
            data: { deviceId: req.args.deviceId },
          });
          return { ok: true, data };
        }
        case 'getGatewayByDeviceId': {
          const data = await prisma.gateway.findUnique({ where: { deviceId: req.args.deviceId } });
          return { ok: true, data };
        }
        case 'updateGatewayState': {
          const data = await prisma.gateway.update({
            where: { deviceId: req.args.deviceId },
            data: {
              lifecycleState: req.args.lifecycleState,
              ...(req.args.isConnected !== undefined ? { isConnected: req.args.isConnected } : {}),
              ...(req.args.deviceToken ? { deviceToken: req.args.deviceToken } : {}),
              ...(req.args.lifecycleState === 'OPERATIONAL' ? { lastHeartbeat: new Date() } : {}),
            },
          });
          return { ok: true, data };
        }
        case 'listGatewaysByOwner': {
          const data = await prisma.gateway.findMany({ where: { ownerPhone: req.args.ownerPhone } });
          return { ok: true, data };
        }

        // ── Printer ──
        case 'upsertPrinter': {
          const data = await prisma.printer.upsert({
            where: { gatewayId_name: { gatewayId: req.args.gatewayId, name: req.args.name } },
            create: {
              gatewayId: req.args.gatewayId,
              name: req.args.name,
              state: req.args.state,
              type: req.args.type ?? null,
            },
            update: { state: req.args.state, reportedAt: new Date() },
          });
          return { ok: true, data };
        }
        case 'updatePrinterState': {
          const data = await prisma.printer.update({
            where: { id: req.args.printerId },
            data: { state: req.args.state, reportedAt: new Date() },
          });
          return { ok: true, data };
        }

        // ── Pricing ──
        case 'setPricing': {
          const data = await prisma.pricing.upsert({
            where: { ownerPhone_pageType: { ownerPhone: req.args.ownerPhone, pageType: req.args.pageType } },
            create: {
              ownerPhone: req.args.ownerPhone,
              pageType: req.args.pageType,
              pricePaise: req.args.pricePaise,
            },
            update: { pricePaise: req.args.pricePaise },
          });
          return { ok: true, data };
        }
        case 'getPricingByOwner': {
          const data = await prisma.pricing.findMany({ where: { ownerPhone: req.args.ownerPhone, isActive: true } });
          return { ok: true, data };
        }

        // ── Session ──
        case 'createSession': {
          const data = await prisma.customerSession.create({
            data: {
              gatewayId: req.args.gatewayId,
              sessionToken: req.args.sessionToken,
              mode: req.args.mode,
              expiresAt: req.args.expiresAt,
            },
          });
          return { ok: true, data };
        }
        case 'getSessionByToken': {
          const data = await prisma.customerSession.findUnique({ where: { sessionToken: req.args.token } });
          return { ok: true, data };
        }
        case 'updateSessionAuth': {
          const data = await prisma.customerSession.update({
            where: { id: req.args.sessionId },
            data: {
              phone: req.args.phone,
              otpHash: req.args.otpHash,
              otpExpiresAt: req.args.otpExpiresAt,
            },
          });
          return { ok: true, data };
        }
        case 'updateSessionState': {
          const data = await prisma.customerSession.update({
            where: { id: req.args.sessionId },
            data: { state: req.args.state },
          });
          return { ok: true, data };
        }

        // ── Document ──
        case 'createDocument': {
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
          return { ok: true, data };
        }
        case 'getDocumentsBySession': {
          const data = await prisma.document.findMany({ where: { sessionToken: req.args.sessionToken } });
          return { ok: true, data };
        }

        // ── Print Job ──
        case 'createPrintJob': {
          const data = await prisma.printJob.create({
            data: {
              jobNumber: req.args.jobNumber,
              gatewayId: req.args.gatewayId,
              sessionId: req.args.sessionId,
              totalPages: req.args.totalPages,
              pricePaise: req.args.pricePaise,
              requirements: req.args.requirements as object,
            },
          });
          return { ok: true, data };
        }
        case 'updateJobState': {
          const data = await prisma.printJob.update({
            where: { id: req.args.jobId },
            data: {
              state: req.args.state,
              ...(req.args.errorReason ? { errorReason: req.args.errorReason } : {}),
              ...(req.args.artifactKey ? { artifactKey: req.args.artifactKey } : {}),
            },
          });
          return { ok: true, data };
        }
        case 'getPrintJob': {
          const data = await prisma.printJob.findUnique({ where: { id: req.args.id } });
          return { ok: true, data };
        }
        case 'listJobsByGateway': {
          const where: Record<string, unknown> = { gatewayId: req.args.gatewayId };
          if (req.args.state) where.state = req.args.state;
          const data = await prisma.printJob.findMany({ where: where as any });
          return { ok: true, data };
        }

        // ── Payment ──
        case 'createPayment': {
          const data = await prisma.payment.create({
            data: {
              jobId: req.args.jobId,
              amountPaise: req.args.amountPaise,
              provider: req.args.provider,
            },
          });
          return { ok: true, data };
        }
        case 'updatePaymentStatus': {
          const data = await prisma.payment.update({
            where: { id: req.args.paymentId },
            data: { status: req.args.status },
          });
          return { ok: true, data };
        }

        // ── Audit ──
        case 'auditLog': {
          await prisma.auditLog.create({
            data: {
              entityType: req.args.entityType,
              entityId: req.args.entityId,
              event: req.args.event,
              fromState: req.args.fromState ?? null,
              toState: req.args.toState ?? null,
            },
          });
          return { ok: true, data: null as unknown as null };
        }

        // ── Lifecycle ──
        case 'ping':
          return { ok: true, data: null as unknown as null };
        case 'stop':
          await prisma.$disconnect();
          return { ok: true, data: null as unknown as null };

        default: {
          const _exhaustive: never = req;
          throw new Error(`Unhandled method: ${(_exhaustive as any)?.method}`);
        }
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return { execute, stop: async () => { await prisma.$disconnect(); } };
}