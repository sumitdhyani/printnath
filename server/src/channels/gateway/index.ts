import { start as startHttp } from '../../shared/http-infra/index';
import { start as startWs, type WsInteractionFunctions } from '../../shared/ws-infra/index';
import type {
  ConnectionObject,
  HttpRequest,
  Respond,
  OnRequest,
  OnNewConnection,
  OnConnectionClosing,
  OnConnectionClosed,
} from '../../shared/http-infra/types';
import type { WebSocketMessage } from '../../shared/ws-infra/types';
import type { In_Req, Out_Resp, Out_Req, Out_Us, In_Resp, HelloRequest, HelloResponse, PrinterInfo, CapabilityInfoPayload, JobStatusPayload } from './types';
import { Contract, Methods } from '../../shared/contracts/protocol';

export type GatewayDeps = {
  config: { httpPort: number; wsPath: string },
  sendToRouter: (event: Out_Req | Out_Us) => Promise<In_Resp | void>,
};

export type GatewayChannel = {
  execute(req: In_Req): Promise<Out_Resp>;
  stop(): Promise<void>;
};

const PREFLIGHT_TIMEOUT_MS = 30_000;
const JOB_ACCEPT_TIMEOUT_MS = 10_000;

export async function initGatewayChannel(deps: GatewayDeps): Promise<GatewayChannel> {
  // ── Device → WS connection tracking ──
  const deviceToConn = new Map<string, ConnectionObject>();
  // ── Cached printer capabilities per device ──
  const deviceCapabilities = new Map<string, PrinterInfo[]>();
  // ── Pending preflight responses keyed by jobId ──
  const pendingPreflight = new Map<string, {
    resolve: (r: { canFulfill: boolean; reason?: string }) => void;
    reject: (e: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  // ── Pending job accept responses keyed by jobId ──
  const pendingAccept = new Map<string, {
    resolve: () => void;
    reject: (e: Error) => void;
    timeout: NodeJS.Timeout;
  }>();

  // ── Step 1: Create WS infra first (produces onWsUpgrade callback) ──
  const wsInfra = startWs({
    path: deps.config.wsPath,
    onNewConnection: (conn, upgradeUrl) => {
      // Parse deviceId from WS URL: /ws/gateway?deviceId=xxx&token=yyy
      const query = new URL(upgradeUrl, 'http://localhost').searchParams;
      const deviceId = query.get('deviceId');
      if (deviceId) {
        deviceToConn.set(deviceId, conn);
      }
    },
    onConnectionClosed: (conn) => {
      for (const [deviceId, c] of deviceToConn) {
        if (c.id === conn.id) {
          deviceToConn.delete(deviceId);
          deviceCapabilities.delete(deviceId);
          deps.sendToRouter({ event: 'GW_DISCONNECTED', payload: { deviceId } });
          return;
        }
      }
    },
    onMessage: (conn, msg) => handleWsMessage(conn,
                                msg,
                                deps,
                                deviceToConn,
                                deviceCapabilities,
                                pendingPreflight,
                                pendingAccept)
  });

  // ── Step 2: Create HTTP server with WS upgrade handler ──
  const httpInfra = await startHttp({
    config: { port: deps.config.httpPort },
    onRequest: (conn, path, req, respond) => handleHttpRequest(conn, path, req, respond, deps),
    onNewConnection: () => {},
    onConnectionClosing: () => {},
    onConnectionClosed: () => {},
    onWsUpgrade: wsInfra.onWsUpgrade,
  });

  await deps.sendToRouter({
    event: 'GW_CHANNEL_READY',
    payload: { wsPort: deps.config.httpPort },
  });

  // ── execute: Router → Gateway channel ──
  async function execute(req: In_Req): Promise<Out_Resp> {
    try {
      switch (req.method) {
        case Methods.RequestPreFlight: {
          const conn = deviceToConn.get(req.args.deviceId);
          if (!conn) return { method: Methods.RequestPreFlight, ok: false, error: { reason: 'Gateway not connected' } };

          wsInfra.send(conn, {
            type: 'text',
            data: JSON.stringify({
              type: 'PRINT_PREFLIGHT',
              payload: { jobId: req.args.jobId, documents: req.args.documents },
              timestamp: new Date().toISOString(),
            }),
          });

          const preflight = await new Promise<{ canFulfill: boolean; reason?: string }>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Preflight timeout')), PREFLIGHT_TIMEOUT_MS);
            pendingPreflight.set(req.args.jobId, { resolve, reject, timeout });
          });

          if (!preflight.canFulfill) {
            return { method: Methods.RequestPreFlight, ok: false, error: { reason: preflight.reason ?? 'Preflight rejected' } };
          }

          return { method: Methods.RequestPreFlight, ok: true, result: {} };
        }

        case Methods.RequestPrint: {
          const conn = deviceToConn.get(req.args.deviceId);
          if (!conn) return { method: Methods.RequestPrint, ok: false, error: { reason: 'Gateway not connected' } };

          wsInfra.send(conn, {
            type: 'text',
            data: JSON.stringify({
              type: 'PRINT_JOB',
              payload: {
                jobId: req.args.jobId,
                artifactUrl: req.args.artifactUrl,
                authToken: req.args.authToken,
                documents: req.args.documents,
              },
              timestamp: new Date().toISOString(),
            }),
          });

          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Job accept timeout')), JOB_ACCEPT_TIMEOUT_MS);
            pendingAccept.set(req.args.jobId, { resolve, reject, timeout });
          });

          return { method: Methods.RequestPrint, ok: true, result: {} };
        }

        case Methods.GetPrinterCapabilities: {
          const printers = deviceCapabilities.get(req.args.deviceId);
          return printers?
            { method: Methods.GetPrinterCapabilities, ok: true, result: { printers } }:
            { method: Methods.GetPrinterCapabilities, ok: false, error: { reason: "Device not connected" } };
        }

        default: {
          const _exhaustive: never = req;
          throw new Error(`Unhandled: ${(_exhaustive as any)?.method}`);
        }
      }
    } catch (err) {
      return { method: req.method, ok: false, error: { reason: err instanceof Error ? err.message : String(err) } } as Out_Resp;
    }
  }

  async function shutdown() {
    await wsInfra.shutdown();
    await httpInfra.shutDown();
  }

  return { execute, stop: shutdown };
}

// ── HTTP request handler ──

async function handleHttpRequest(
  conn: ConnectionObject, path: string, req: HttpRequest, respond: Respond,
  deps: GatewayDeps,
) {
  if (path === '/api/gateway/hello' && req.method === 'POST') {
    const body = req.body as HelloRequest;
    if (!body?.deviceId) {
      await respond({ status: 400, headers: {}, body: '{"error":"Missing deviceId"}' });
      return;
    }

    // Router looks up gateway and returns state
    const gwResp: In_Resp = await deps.sendToRouter({
      method: Methods.RequestDeviceDetails,
      args: { deviceId: body.deviceId}
    }) as In_Resp;

    if (!gwResp.ok)
      return await respond({ status: 404, headers: {}, body: `{"error": ${gwResp.error.reason}}`});

    const gw = gwResp.result as Contract[typeof Methods.RequestDeviceDetails]["result"];
    const helloResp: HelloResponse = {
      state: gw.lifecycleState as HelloResponse['state'],
      deviceToken: gw.deviceToken ?? undefined,
      retryAfter: gw.lifecycleState === 'PRE_ACTIVATION' ? 60 : undefined,
    };

    await respond({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(helloResp),
    });
    return;
  }

  // Artifact download
  if (path.startsWith('/api/gateway/jobs/') && req.method === 'GET') {
    const artifactMatch = path.match(/^\/api\/gateway\/jobs\/([^\/]+)\/artifact$/);
    if (!artifactMatch) {
      await respond({ status: 404, headers: {}, body: '{"error":"Not found"}' });
      return;
    }
    const jobId = artifactMatch[1];

    const authHeader = (req.headers['authorization'] ?? req.headers['Authorization'] ?? '') as string;
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!tokenMatch) {
      await respond({ status: 401, headers: {}, body: '{"error":"Missing or invalid Authorization header"}' });
      return;
    }

    const validationResp = await deps.sendToRouter({
      method: Methods.ValidateArtifactToken,
      args: { jobId, authToken: tokenMatch[1] },
    }) as In_Resp;

    if (!validationResp.ok) {
      await respond({ status: 401, headers: {}, body: '{"error":"Invalid or expired token"}' });
      return;
    }

    const artifactResp = await deps.sendToRouter({
      method: Methods.FetchArtifact,
      args: { jobId },
    }) as In_Resp;

    if (!artifactResp.ok) {
      await respond({ status: 404, headers: {}, body: '{"error":"Artifact not found"}' });
      return;
    }

    const artifactData = artifactResp.result as Contract[typeof Methods.FetchArtifact]["result"];
    await respond({
      status: 200,
      headers: { 'Content-Type': artifactData.contentType },
      body: artifactData.stream,
    });
    return;
  }

  // Unknown route
  await respond({ status: 404, headers: {}, body: '{"error":"Not found"}' });
}

// ── WebSocket message handler ──

async function handleWsMessage(
  conn: ConnectionObject,
  rawMsg: WebSocketMessage,
  deps: GatewayDeps,
  deviceToConn: Map<string, ConnectionObject>,
  deviceCapabilities: Map<string, PrinterInfo[]>,
  pendingPreflight: Map<string, {
        resolve: (r: { canFulfill: boolean; reason?: string }) => void,
        reject: (e: Error) => void,
        timeout: NodeJS.Timeout}>,
  pendingAccept: Map<string, {
        resolve: () => void,
        reject: (e: Error) => void,
        timeout: NodeJS.Timeout}>) {
  if (rawMsg.type !== 'text') return;
  let parsed: { type: string; payload?: unknown };
  try { parsed = JSON.parse(rawMsg.data); } catch { return; }

  // CAPABILITY_INFO from gateway arrives here. Also handles other WS messages.

  switch (parsed.type) {
    case 'HEARTBEAT':
      break;

    case 'CAPABILITY_INFO': {
      const payload = parsed.payload as CapabilityInfoPayload;
      for (const [deviceId, c] of deviceToConn) {
        if (c.id === conn.id) {
          deviceCapabilities.set(deviceId, payload.printers);
          break;
        }
      }
      break;
    }

    case 'PRINT_PREFLIGHT_RESPONSE': {
      const payload = parsed.payload as { jobId: string; canFulfill: boolean; reason?: string };
      const pending = pendingPreflight.get(payload.jobId);
      if (pending) {
        clearTimeout(pending.timeout);
        pendingPreflight.delete(payload.jobId);
        pending.resolve({ canFulfill: payload.canFulfill, reason: payload.reason });
      }
      break;
    }

    case 'JOB_ACCEPTED': {
      const payload = parsed.payload as { jobId: string };
      const pending = pendingAccept.get(payload.jobId);
      if (pending) {
        clearTimeout(pending.timeout);
        pendingAccept.delete(payload.jobId);
        pending.resolve();
      }
      break;
    }

    case 'JOB_STATUS': {
      const payload = parsed.payload as JobStatusPayload;
      for (const [deviceId, c] of deviceToConn) {
        if (c.id === conn.id) {
          deps.sendToRouter({
            event: 'JOB_STATUS_UPDATE',
            payload: { deviceId, jobId: payload.jobId, status: payload.status, reason: payload.reason },
          });
          break;
        }
      }
      break;
    }
  }
}