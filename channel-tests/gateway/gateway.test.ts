import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocket } from 'ws';
import { Readable } from 'node:stream';
import { initGatewayChannel, type GatewayChannel, type GatewayDeps } from '../../server/src/channels/gateway/index';
import { Methods } from '../../server/src/channels/gateway/types';
import type { Out_Req, Out_Us, In_Resp, PrinterInfo } from '../../server/src/channels/gateway/types';

// ── Test constants ──
const TEST_PORT = 18901;
const WS_PATH = '/ws/gateway';
const KNOWN_DEVICE = 'device-abc';
const UNKNOWN_DEVICE = 'device-unknown';
const VALID_TOKEN = 'job-token-valid';
const INVALID_TOKEN = 'job-token-invalid';
const TEST_JOB_ID = 'job-001';

// ── Fake gateway helpers ──

function wsUrl(deviceId: string): string {
  return `ws://localhost:${TEST_PORT}${WS_PATH}?deviceId=${deviceId}&token=test`;
}

function sendWs(ws: WebSocket, type: string, payload: unknown) {
  ws.send(JSON.stringify({ type, payload, timestamp: new Date().toISOString() }));
}

function waitForWsMessage(ws: WebSocket): Promise<{ type: string; payload?: unknown }> {
  return new Promise((resolve) => {
    ws.once('message', (data: Buffer) => {
      resolve(JSON.parse(data.toString()));
    });
  });
}

// ── Mock helpers ──

interface MockCalls {
  event: string;
  payload: unknown;
}

function createMockDeps(): GatewayDeps & { calls: MockCalls[] } {
  const calls: MockCalls[] = [];

  const sendToRouter = async (event: Out_Req | Out_Us): Promise<In_Resp | void> => {
    if ('method' in event) {
      // ── Out_Req: return typed responses ──
      switch (event.method) {
        case Methods.RequestDeviceDetails:
          if (event.args.deviceId === KNOWN_DEVICE) {
            return {
              method: Methods.RequestDeviceDetails,
              ok: true,
              data: { deviceId: KNOWN_DEVICE, lifecycleState: 'OPERATIONAL', deviceToken: 'dev-token' },
            } as In_Resp;
          }
          return { method: event.method as string, ok: false, error: 'Unknown device' } as In_Resp;

        case Methods.ValidateArtifactToken:
          if (event.args.authToken === VALID_TOKEN) {
            return { method: Methods.ValidateArtifactToken, ok: true, data: { valid: true } } as In_Resp;
          }
          return { method: event.method as string, ok: false, error: 'Invalid token' } as In_Resp;

        default:
          return { method: event.method as string, ok: false, error: 'Unhandled Out_Req' } as In_Resp;
      }
    } else {
      // ── Out_Us: record for later assertion ──
      calls.push({ event: event.event, payload: event.payload });
    }
  };

  const docStore = {
    getArtifactStream: async (jobId: string) => {
      if (jobId === TEST_JOB_ID) {
        return {
          stream: Readable.from([Buffer.from('fake-pdf-content')]),
          contentType: 'application/pdf',
          contentLength: 17,
        };
      }
      return null;
    },
  };

  return { config: { httpPort: TEST_PORT, wsPath: WS_PATH }, sendToRouter, docStore, calls };
}

// ── Channel lifecycle ──

let channel: GatewayChannel;
let deps: ReturnType<typeof createMockDeps>;

beforeEach(async () => {
  deps = createMockDeps();
  channel = await initGatewayChannel(deps);
});

afterEach(async () => {
  await channel.stop();
});

// ══════════════════════════════════════════════════════════════
// HTTP HELLO
// ══════════════════════════════════════════════════════════════

describe('HTTP HELLO', () => {
  /*
   * Gateway                          Server (Gateway Channel)
   *   │                                    │
   *   │  POST /api/gateway/hello           │
   *   │  { deviceId: "device-abc" }        │
   *   │───────────────────────────────────→│
   *   │                                    │
   *   │  sendToRouter(RequestDeviceDetails) │
   *   │  ← returns OPERATIONAL state       │
   *   │                                    │
   *   │  200 { state: "OPERATIONAL",       │
   *   │        deviceToken: "dev-token" }  │
   *   │←───────────────────────────────────│
   */
  test('known device returns OPERATIONAL state', async () => {
    const body = JSON.stringify({ deviceId: KNOWN_DEVICE });
    const res = await fetch(`http://localhost:${TEST_PORT}/api/gateway/hello`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.state).toBe('OPERATIONAL');
    expect(data.deviceToken).toBe('dev-token');
  });

  /*
   * Gateway                          Server
   *   │                                    │
   *   │  POST /api/gateway/hello           │
   *   │  { deviceId: "device-unknown" }    │
   *   │───────────────────────────────────→│
   *   │                                    │
   *   │  sendToRouter(RequestDeviceDetails) │
   *   │  ← returns ok:false                │
   *   │                                    │
   *   │  404 { error: "Unknown device" }   │
   *   │←───────────────────────────────────│
   */
  test('unknown device returns 404', async () => {
    const body = JSON.stringify({ deviceId: UNKNOWN_DEVICE });
    const res = await fetch(`http://localhost:${TEST_PORT}/api/gateway/hello`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    expect(res.status).toBe(404);
  });

  /*
   * Gateway                          Server
   *   │                                    │
   *   │  POST /api/gateway/hello           │
   *   │  { }                               │
   *   │───────────────────────────────────→│
   *   │                                    │
   *   │  400 { error: "Missing deviceId" } │
   *   │←───────────────────────────────────│
   */
  test('missing deviceId returns 400', async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/api/gateway/hello`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(400);
  });

  test('unknown route returns 404', async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/api/gateway/unknown`, {
      method: 'GET',
    });
    expect(res.status).toBe(404);
  });
});

// ══════════════════════════════════════════════════════════════
// WebSocket connect / disconnect
// ══════════════════════════════════════════════════════════════

describe('WebSocket lifecycle', () => {
  /*
   * Fake Gateway                      Server
   *   │                                    │
   *   │  WS connect /ws/gateway            │
   *   │  ?deviceId="device-abc"            │
   *   │───────────────────────────────────→│
   *   │                                    │
   *   │  deviceToConn.set("device-abc", —) │
   *   │                                    │
   *   │  [connection established]          │
   *   │                                    │
   *   │  ── later ──                       │
   *   │                                    │
   *   │  WS disconnect                     │
   *   │───────────────────────────────────→│
   *   │                                    │
   *   │  sendToRouter(GW_DISCONNECTED)     │
   *   │  { deviceId: "device-abc" }        │
   *   │                                    │
   *   │  deviceCapabilities.delete()       │
   */
  test('connect then disconnect fires GW_DISCONNECTED', async () => {
    const ws = new WebSocket(wsUrl(KNOWN_DEVICE));
    await new Promise<void>((resolve) => ws.on('open', resolve));

    ws.close();
    // Wait for server to process close
    await new Promise((r) => setTimeout(r, 200));

    const disc = deps.calls.find((c) => c.event === 'GW_DISCONNECTED');
    expect(disc).toBeDefined();
    expect((disc!.payload as any).deviceId).toBe(KNOWN_DEVICE);
  });
});

// ══════════════════════════════════════════════════════════════
// Printer capabilities
// ══════════════════════════════════════════════════════════════

describe('Printer capabilities', () => {
  const fakePrinters: PrinterInfo[] = [
    { name: 'HP LaserJet', state: 'IDLE', capabilities: { color: false, duplex: true, sizes: ['A4'] } },
  ];

  /*
   * Fake Gateway                      Server
   *   │                                    │
   *   │  WS connect                        │
   *   │───────────────────────────────────→│
   *   │                                    │
   *   │  WS: CAPABILITY_INFO           │
   *   │  { printers: [...] }               │
   *   │←───────────────────────────────────│
   *   │                                    │
   *   │  deviceCapabilities.set(device, —) │
   *   │                                    │
   *   │  Router                            │
   *   │    │ execute(GetPrinterCapabilities)│
   *   │    │ { deviceId }                  │
   *   │    │──────────────────────────────→│
   *   │    │                               │
   *   │    │ ← { printers: [...] } (cached)│
   *   │    │←──────────────────────────────│
   */
  test('CAPABILITY_INFO is cached and returned via execute', async () => {
    const ws = new WebSocket(wsUrl(KNOWN_DEVICE));
    await new Promise<void>((resolve) => ws.on('open', resolve));

    sendWs(ws, 'CAPABILITY_INFO', { printers: fakePrinters });
    await new Promise((r) => setTimeout(r, 100));

    const result = await channel.execute({
      method: Methods.GetPrinterCapabilities,
      args: { deviceId: KNOWN_DEVICE },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.printers).toEqual(fakePrinters);
    ws.close();
  });

  test('unknown device returns empty printer list', async () => {
    const result = await channel.execute({
      method: Methods.GetPrinterCapabilities,
      args: { deviceId: UNKNOWN_DEVICE },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.printers).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════
// RequestPreFlight
// ══════════════════════════════════════════════════════════════

describe('RequestPreFlight', () => {
  const preflightArgs = {
    deviceId: KNOWN_DEVICE,
    jobId: TEST_JOB_ID,
    documents: [{ pageCount: 4, color: false, duplex: true, paperSize: 'A4' as const, copies: 1 }],
  };

  /*
   * Router                        Server (Gateway Channel)         Fake Gateway
   *   │                                    │                            │
   *   │ execute(RequestPreFlight)          │                            │
   *   │ { deviceId, jobId, documents }     │                            │
   *   │───────────────────────────────────→│                            │
   *   │                                    │                            │
   *   │                         WS: PRINT_PREFLIGHT                    │
   *   │                         { jobId, documents }                   │
   *   │                                    │───────────────────────────→│
   *   │                                    │                            │
   *   │                         WS: PRINT_PREFLIGHT_RESPONSE           │
   *   │                         { canFulfill: true }                   │
   *   │                                    │←───────────────────────────│
   *   │                                    │                            │
   *   │ ← { ok: true }                     │                            │
   *   │←───────────────────────────────────│                            │
   */
  test('gateway accepts — returns ok:true', async () => {
    const ws = new WebSocket(wsUrl(KNOWN_DEVICE));
    await new Promise<void>((resolve) => ws.on('open', resolve));

    const wsMsg = waitForWsMessage(ws);
    const execPromise = channel.execute({ method: Methods.RequestPreFlight, args: preflightArgs });

    const msg = await wsMsg;
    expect(msg.type).toBe('PRINT_PREFLIGHT');

    sendWs(ws, 'PRINT_PREFLIGHT_RESPONSE', { jobId: TEST_JOB_ID, canFulfill: true });

    const result = await execPromise;
    expect(result.ok).toBe(true);
    ws.close();
  });

  /*
   * Router                        Server                             Fake Gateway
   *   │                                    │                            │
   *   │ execute(RequestPreFlight)          │                            │
   *   │───────────────────────────────────→│                            │
   *   │                         WS: PRINT_PREFLIGHT                    │
   *   │                                    │───────────────────────────→│
   *   │                                    │                            │
   *   │                         WS: PRINT_PREFLIGHT_RESPONSE           │
   *   │                         { canFulfill: false,                   │
   *   │                           reason: "Color unavailable" }        │
   *   │                                    │←───────────────────────────│
   *   │                                    │                            │
   *   │ ← { ok: false,                     │                            │
   *   │     error: "Color unavailable" }   │                            │
   *   │←───────────────────────────────────│                            │
   */
  test('gateway rejects — returns ok:false with reason', async () => {
    const ws = new WebSocket(wsUrl(KNOWN_DEVICE));
    await new Promise<void>((resolve) => ws.on('open', resolve));

    const execPromise = channel.execute({ method: Methods.RequestPreFlight, args: preflightArgs });
    await waitForWsMessage(ws);

    sendWs(ws, 'PRINT_PREFLIGHT_RESPONSE', { jobId: TEST_JOB_ID, canFulfill: false, reason: 'Insufficient pages for the job' });

    const result = await execPromise;
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Insufficient pages for the job');
    ws.close();
  });

  /*
   * Router                        Server
   *   │                                    │
   *   │ execute(RequestPreFlight)          │
   *   │ { deviceId: "unknown" }            │
   *   │───────────────────────────────────→│
   *   │                                    │
   *   │  deviceToConn.get() → null         │
   *   │                                    │
   *   │ ← { ok: false,                     │
   *   │     error: "Gateway not connected" }│
   *   │←───────────────────────────────────│
   */
  test('gateway not connected — returns error', async () => {
    const result = await channel.execute({
      method: Methods.RequestPreFlight,
      args: { ...preflightArgs, deviceId: UNKNOWN_DEVICE },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not connected/i);
  });

  /*
   * Router                        Server                             Fake Gateway
   *   │                                    │                            │
   *   │ execute(RequestPreFlight)          │                            │
   *   │───────────────────────────────────→│                            │
   *   │                         WS: PRINT_PREFLIGHT                    │
   *   │                                    │───────────────────────────→│
   *   │                                    │                            │
   *   │  [30s timeout — no response]       │                            │
   *   │                                    │                            │
   *   │ ← { ok: false,                     │                            │
   *   │     error: "Preflight timeout" }   │                            │
   *   │←───────────────────────────────────│                            │
   */
  test('no response — times out', { timeout: 35000 }, async () => {
    const ws = new WebSocket(wsUrl(KNOWN_DEVICE));
    await new Promise<void>((resolve) => ws.on('open', resolve));

    const result = await channel.execute({
      method: Methods.RequestPreFlight,
      args: preflightArgs,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/timeout/i);
    ws.close();
  });
});

// ══════════════════════════════════════════════════════════════
// RequestPrint
// ══════════════════════════════════════════════════════════════

describe('RequestPrint', () => {
  const printArgs = {
    deviceId: KNOWN_DEVICE,
    jobId: TEST_JOB_ID,
    artifactUrl: `/api/gateway/jobs/${TEST_JOB_ID}/artifact`,
    authToken: VALID_TOKEN,
    documents: [{ pageCount: 4, color: false, duplex: true, paperSize: 'A4' as const, copies: 1 }],
  };

  /*
   * Router                        Server                             Fake Gateway
   *   │                                    │                            │
   *   │ execute(RequestPrint)              │                            │
   *   │ { deviceId, jobId,                 │                            │
   *   │   artifactUrl, authToken,          │                            │
   *   │   documents }                      │                            │
   *   │───────────────────────────────────→│                            │
   *   │                                    │                            │
   *   │                         WS: PRINT_JOB                          │
   *   │                         { jobId, artifactUrl,                  │
   *   │                           authToken, documents }               │
   *   │                                    │───────────────────────────→│
   *   │                                    │                            │
   *   │                         WS: JOB_ACCEPTED                       │
   *   │                         { jobId }                              │
   *   │                                    │←───────────────────────────│
   *   │                                    │                            │
   *   │ ← { ok: true }                     │                            │
   *   │←───────────────────────────────────│                            │
   */
  test('gateway accepts — returns ok:true', async () => {
    const ws = new WebSocket(wsUrl(KNOWN_DEVICE));
    await new Promise<void>((resolve) => ws.on('open', resolve));

    const wsMsg = waitForWsMessage(ws);
    const execPromise = channel.execute({ method: Methods.RequestPrint, args: printArgs });

    const msg = await wsMsg;
    expect(msg.type).toBe('PRINT_JOB');

    sendWs(ws, 'JOB_ACCEPTED', { jobId: TEST_JOB_ID });

    const result = await execPromise;
    expect(result.ok).toBe(true);
    ws.close();
  });

  /*
   * Router                        Server
   *   │                                    │
   *   │ execute(RequestPrint)              │
   *   │ { deviceId: "unknown" }            │
   *   │───────────────────────────────────→│
   *   │                                    │
   *   │ ← { ok: false,                     │
   *   │     error: "Gateway not connected" }│
   *   │←───────────────────────────────────│
   */
  test('gateway not connected — returns error', async () => {
    const result = await channel.execute({
      method: Methods.RequestPrint,
      args: { ...printArgs, deviceId: UNKNOWN_DEVICE },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not connected/i);
  });

  /*
   * Router                        Server                             Fake Gateway
   *   │                                    │                            │
   *   │ execute(RequestPrint)              │                            │
   *   │───────────────────────────────────→│                            │
   *   │                         WS: PRINT_JOB                          │
   *   │                                    │───────────────────────────→│
   *   │                                    │                            │
   *   │  [10s timeout — no response]       │                            │
   *   │                                    │                            │
   *   │ ← { ok: false,                     │                            │
   *   │     error: "Job accept timeout" }  │                            │
   *   │←───────────────────────────────────│                            │
   */
  test('no response — times out', { timeout: 15000 }, async () => {
    const ws = new WebSocket(wsUrl(KNOWN_DEVICE));
    await new Promise<void>((resolve) => ws.on('open', resolve));

    const result = await channel.execute({
      method: Methods.RequestPrint,
      args: printArgs,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/timeout/i);
    ws.close();
  });
});

// ══════════════════════════════════════════════════════════════
// JOB_STATUS
// ══════════════════════════════════════════════════════════════

describe('JOB_STATUS', () => {
  /*
   * Fake Gateway                      Server
   *   │                                    │
   *   │  WS: JOB_STATUS                    │
   *   │  { jobId, status: "PRINTING",     │
   *   │    reason: null, at: "..." }       │
   *   │───────────────────────────────────→│
   *   │                                    │
   *   │  sendToRouter(JOB_STATUS_UPDATE)   │
   *   │  { deviceId, jobId,               │
   *   │    status: "PRINTING" }            │
   *   │                                    │
   *   │  ── later ──                       │
   *   │                                    │
   *   │  WS: JOB_STATUS                    │
   *   │  { jobId, status: "COMPLETED",    │
   *   │    at: "..." }                     │
   *   │───────────────────────────────────→│
   *   │                                    │
   *   │  sendToRouter(JOB_STATUS_UPDATE)   │
   *   │  { deviceId, jobId,               │
   *   │    status: "COMPLETED" }           │
   */
  test('forwards status updates as Out_Us events', async () => {
    const ws = new WebSocket(wsUrl(KNOWN_DEVICE));
    await new Promise<void>((resolve) => ws.on('open', resolve));
    await new Promise((r) => setTimeout(r, 50));

    sendWs(ws, 'JOB_STATUS', { jobId: TEST_JOB_ID, status: 'PRINTING', at: new Date().toISOString() });
    await new Promise((r) => setTimeout(r, 50));

    sendWs(ws, 'JOB_STATUS', { jobId: TEST_JOB_ID, status: 'COMPLETED', at: new Date().toISOString() });
    await new Promise((r) => setTimeout(r, 50));

    const statusCalls = deps.calls.filter((c) => c.event === 'JOB_STATUS_UPDATE');
    expect(statusCalls).toHaveLength(2);
    expect((statusCalls[0].payload as any).status).toBe('PRINTING');
    expect((statusCalls[1].payload as any).status).toBe('COMPLETED');
    ws.close();
  });
});

// ══════════════════════════════════════════════════════════════
// Artifact download
// ══════════════════════════════════════════════════════════════

describe('Artifact download', () => {
  /*
   * Gateway                          Server (Gateway Channel)
   *   │                                    │
   *   │  GET /api/gateway/jobs/job-001/artifact
   *   │  Authorization: Bearer valid-token │
   *   │───────────────────────────────────→│
   *   │                                    │
   *   │  sendToRouter(ValidateArtifactToken)│
   *   │  ← { valid: true }                 │
   *   │                                    │
   *   │  docStore.getArtifactStream(jobId) │
   *   │  ← Readable stream                 │
   *   │                                    │
   *   │  200 Content-Type: application/pdf │
   *   │  [PDF bytes]                       │
   *   │←───────────────────────────────────│
   */
  test('valid token streams the artifact', async () => {
    const res = await fetch(
      `http://localhost:${TEST_PORT}/api/gateway/jobs/${TEST_JOB_ID}/artifact`,
      { headers: { Authorization: `Bearer ${VALID_TOKEN}` } },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    const body = await res.text();
    expect(body).toBe('fake-pdf-content');
  });

  /*
   * Gateway                          Server
   *   │                                    │
   *   │  GET /api/gateway/jobs/job-001/artifact
   *   │  [no Authorization header]         │
   *   │───────────────────────────────────→│
   *   │                                    │
   *   │  401 { error: "Missing or invalid  │
   *   │        Authorization header" }     │
   *   │←───────────────────────────────────│
   */
  test('missing auth header returns 401', async () => {
    const res = await fetch(
      `http://localhost:${TEST_PORT}/api/gateway/jobs/${TEST_JOB_ID}/artifact`,
    );
    expect(res.status).toBe(401);
  });

  /*
   * Gateway                          Server
   *   │                                    │
   *   │  GET /api/gateway/jobs/job-001/artifact
   *   │  Authorization: Bearer bad-token   │
   *   │───────────────────────────────────→│
   *   │                                    │
   *   │  sendToRouter(ValidateArtifactToken)│
   *   │  ← { valid: false }                │
   *   │                                    │
   *   │  401 { error: "Invalid or expired  │
   *   │        token" }                    │
   *   │←───────────────────────────────────│
   */
  test('invalid token returns 401', async () => {
    const res = await fetch(
      `http://localhost:${TEST_PORT}/api/gateway/jobs/${TEST_JOB_ID}/artifact`,
      { headers: { Authorization: `Bearer ${INVALID_TOKEN}` } },
    );
    expect(res.status).toBe(401);
  });

  /*
   * Gateway                          Server
   *   │                                    │
   *   │  GET /api/gateway/jobs/job-unknown/artifact
   *   │  Authorization: Bearer valid-token │
   *   │───────────────────────────────────→│
   *   │                                    │
   *   │  sendToRouter(ValidateArtifactToken)│
   *   │  ← { valid: true }                 │
   *   │                                    │
   *   │  docStore.getArtifactStream()      │
   *   │  ← null                            │
   *   │                                    │
   *   │  404 { error: "Artifact not found" }│
   *   │←───────────────────────────────────│
   */
  test('artifact not found returns 404', async () => {
    const res = await fetch(
      `http://localhost:${TEST_PORT}/api/gateway/jobs/job-unknown/artifact`,
      { headers: { Authorization: `Bearer ${VALID_TOKEN}` } },
    );
    expect(res.status).toBe(404);
  });
});

// ══════════════════════════════════════════════════════════════
// Unknown WS message types
// ══════════════════════════════════════════════════════════════

describe('Unknown WS messages', () => {
  /*
   * Fake Gateway                      Server
   *   │                                    │
   *   │  WS: UNKNOWN_TYPE                  │
   *   │  { payload: ... }                  │
   *   │───────────────────────────────────→│
   *   │                                    │
   *   │  switch(parsed.type) — no match    │
   *   │  → silently ignored                │
   *   │  [no crash, no response]           │
   */
  test('unknown WS message type is silently ignored', async () => {
    const ws = new WebSocket(wsUrl(KNOWN_DEVICE));
    await new Promise<void>((resolve) => ws.on('open', resolve));

    sendWs(ws, 'UNKNOWN_TYPE', { foo: 'bar' });
    await new Promise((r) => setTimeout(r, 100));

    // Channel should still be operational
    const result = await channel.execute({
      method: Methods.GetPrinterCapabilities,
      args: { deviceId: KNOWN_DEVICE },
    });
    expect(result.ok).toBe(true);
    ws.close();
  });
});
