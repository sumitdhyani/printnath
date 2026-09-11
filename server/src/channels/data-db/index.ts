import { PrismaClient } from '@prisma/client';
import type { DataDbIn_Req, DataDbOut_Resp } from './types';

export type DataDbChannel = {
  execute(req: DataDbIn_Req): Promise<DataDbOut_Resp>;
  stop(): Promise<void>;
};

export type DataDbDeps = {
  config: { url: string };
  sendToRouter: (event: { source: string; type: string; payload: unknown }) => Promise<void>;
};

export async function initDataDb(deps: DataDbDeps): Promise<DataDbChannel> {
  const prisma = new PrismaClient({ datasourceUrl: deps.config.url });
  await prisma.$connect();

  await deps.sendToRouter({
    source: 'data-db',
    type: 'CHANNEL_READY',
    payload: { status: 'connected' },
  });

  async function execute(req: DataDbIn_Req): Promise<DataDbOut_Resp> {
    try {
      switch (req.method) {
        case 'getShopByCode': {
          const data = await prisma.shop.findUnique({ where: { code: req.args.code } });
          return { ok: true, data };
        }
        case 'registerGateway': {
          const data = await prisma.gateway.create({
            data: { deviceId: req.args.deviceId, softwareVer: req.args.softwareVer },
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
              ...(req.args.lifecycleState === 'OPERATIONAL' ? { lastHeartbeat: new Date() } : {}),
            },
          });
          return { ok: true, data };
        }
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
        case 'getPricingByShop': {
          const data = await prisma.pricing.findMany({ where: { shopId: req.args.shopId, isActive: true } });
          return { ok: true, data };
        }
        case 'createSession': {
          const data = await prisma.customerSession.create({
            data: {
              shopId: req.args.shopId,
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
        case 'createPrintJob': {
          const data = await prisma.printJob.create({
            data: {
              jobNumber: req.args.jobNumber,
              shopId: req.args.shopId,
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
              ...(req.args.gatewayId ? { gatewayId: req.args.gatewayId } : {}),
              ...(req.args.artifactKey ? { artifactKey: req.args.artifactKey } : {}),
            },
          });
          return { ok: true, data };
        }
        case 'getPrintJob': {
          const data = await prisma.printJob.findUnique({ where: { id: req.args.id } });
          return { ok: true, data };
        }
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