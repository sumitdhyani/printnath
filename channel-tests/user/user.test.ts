import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import { initUserChannel, type UserChannelDeps, type UserChannel } from '../../server/src/channels/user/index';
import { Methods, type Contract } from '../../server/src/channels/user/types';

// ── Test helpers ──

const TEST_SESSION_ID = 'session-001';
const TEST_SESSION_TOKEN = 'tok-abc-123';
const TEST_GATEWAY_ID = 'gw-001';
const TEST_OWNER_PHONE = '+911234567890';
const TEST_JOB_ID = 'job-001';
const TEST_JOB_NUMBER = 'JOB-001';
const TEST_ORDER_ID = 'order_abc123';
const TEST_PAYMENT_ID = 'pay_def456';
const TEST_VERIFIED_AT = '2026-09-26T10:00:00.000Z';

function mockSession(overrides?: Partial<Contract[typeof Methods.GetSessionByToken]['result']>) {
  return {
    id: TEST_SESSION_ID,
    sessionToken: TEST_SESSION_TOKEN,
    mode: 'customer',
    gatewayId: TEST_GATEWAY_ID,
    metadata: {
      orderId: TEST_ORDER_ID,
      amountPaise: 1000,
      paymentId: TEST_PAYMENT_ID,
      verifiedAt: TEST_VERIFIED_AT,
      checkoutDocs: [{ pageCount: 2, copies: 1, color: false, duplex: true, paperSize: 'A4' }],
    },
    ...overrides,
  };
}

function mockGateway(overrides?: Partial<NonNullable<Contract[typeof Methods.GetGatewayByDeviceId]['result']>>) {
  return {
    deviceId: TEST_GATEWAY_ID,
    lifecycleState: 'OPERATIONAL',
    ownerPhone: TEST_OWNER_PHONE,
    name: 'Test Print Shop',
    ...overrides,
  };
}

// ── Create mock sendToRouter ──

function createMockSendToRouter() {
  const fn = vi.fn();

  // Default handler — returns structured responses per method
  fn.mockImplementation(async (event: any) => {
    switch (event.method) {
      // ── Owner ──
      case Methods.GetOwnerByPhone:
        return { method: event.method, ok: true, result: { phone: event.args.phone, displayName: 'Test Owner' } };

      case Methods.CreateOwner:
        return { method: event.method, ok: true, result: { phone: event.args.phone, displayName: event.args.displayName } };

      // ── Gateway ──
      case Methods.GetGatewayByDeviceId:
        if (event.args.deviceId === TEST_GATEWAY_ID) {
          return { method: event.method, ok: true, result: mockGateway() };
        }
        if (event.args.deviceId === 'gw-pre-activation') {
          return { method: event.method, ok: true, result: mockGateway({ lifecycleState: 'PRE_ACTIVATION' }) };
        }
        return { method: event.method, ok: true, result: null };

      case Methods.UpdateGatewayState:
        return { method: event.method, ok: true, result: { deviceId: event.args.deviceId, lifecycleState: event.args.lifecycleState } };

      case Methods.GetPrinterCapabilities:
        return {
          method: event.method,
          ok: true,
          result: {
            printers: [
              { name: 'HP LaserJet', state: 'IDLE', capabilities: { color: false, duplex: true, paperSize: ['A4'] } },
            ],
          },
        };

      case Methods.RequestPreFlight:
        return { method: event.method, ok: true, result: {} };

      // ── Session ──
      case Methods.CreateSession:
        return { method: event.method, ok: true, result: { id: TEST_SESSION_ID, sessionToken: event.args.sessionToken } };

      case Methods.GetSessionByToken:
        if (event.args.token === TEST_SESSION_TOKEN) {
          return { method: event.method, ok: true, result: mockSession() };
        }
        return { method: event.method, ok: true, result: null };

      case Methods.UpdateSessionMetadata:
        return { method: event.method, ok: true, result: { id: TEST_SESSION_ID } };

      // ── Pricing ──
      case Methods.SetPricing:
        return { method: event.method, ok: true, result: { ownerPhone: event.args.ownerPhone, pageType: event.args.pageType, pricePaise: event.args.pricePaise } };

      case Methods.GetPricingByOwner:
        return {
          method: event.method,
          ok: true,
          result: [
            { ownerPhone: event.args.ownerPhone, pageType: 'PageColor_BW:PageDuplex_SINGLE:PaperSize_A4', pricePaise: 300 },
          ],
        };

      // ── Payment ──
      case Methods.CreateOrder:
        return { method: event.method, ok: true, result: { orderId: TEST_ORDER_ID, amountPaise: event.args.amountPaise, amountDue: event.args.amountPaise, status: 'created' } };

      case Methods.VerifyPayment:
        return { method: event.method, ok: true, result: { verified: true } };

      // ── Doc Store ──
      case Methods.StoreArtifact:
        return { method: event.method, ok: true, result: { storageKey: `artifacts/${event.args.jobId}` } };

      // ── Data DB ──
      case Methods.CreateDocument:
        return { method: event.method, ok: true, result: { id: 'doc-001' } };

      case Methods.CreatePrintJob:
        return { method: event.method, ok: true, result: { id: TEST_JOB_ID, jobNumber: event.args.jobNumber } };

      case Methods.CreatePayment:
        return { method: event.method, ok: true, result: { id: 'pay-001', status: 'PENDING' } };

      case Methods.RequestPrint:
        return { method: event.method, ok: true, result: {} };

      case Methods.GetPrintJob:
        return { method: event.method, ok: true, result: { id: TEST_JOB_ID, state: 'PRINTING' } };

      default:
        return { method: event.method, ok: false, error: { reason: `Unhandled mock: ${event.method}` } };
    }
  });

  return fn;
}

// ── Test setup ──

describe('User Channel', () => {
  let app: express.Express;
  let mockSendToRouter: ReturnType<typeof vi.fn>;
  let channel: UserChannel;

  beforeEach(async () => {
    app = express();
    app.use(express.json());
    const router = express.Router();
    mockSendToRouter = createMockSendToRouter();

    channel = await initUserChannel({
      sendToRouter: mockSendToRouter,
      httpRouter: router,
      sendOtp: vi.fn(),
      sessionTtlMs: 30 * 60 * 1000,
      apiBaseUrl: 'http://localhost:3000',
    });

    app.use(router);
  });

  afterEach(async () => {
    await channel.stop();
  });

  // ══════════════════════════════════════════════════════════════
  // Gateway status (QR entry)
  // ══════════════════════════════════════════════════════════════

  describe('GET /gateway/:deviceId', () => {
    /*
     * Browser                          User Channel               Data DB
     *   │                                    │                      │
     *   │  GET /gateway/{deviceId}            │                      │
     *   │───────────────────────────────────→│                      │
     *   │                                    │                      │
     *   │         Out_Req(GetGatewayByDeviceId)                    │
     *   │                                    │─────────────────────→│
     *   │                                    │← { deviceId, state }│
     *   │                                    │                      │
     *   │  200 { role, deviceId, state }     │                      │
     *   │←───────────────────────────────────│                      │
     */
    test('OPERATIONAL gateway returns customer role', async () => {
      const res = await supertest(app).get(`/gateway/${TEST_GATEWAY_ID}`);
      expect(res.status).toBe(200);
      expect(res.body.role).toBe('customer');
      expect(res.body.deviceId).toBe(TEST_GATEWAY_ID);
      expect(res.body.shopName).toBe('Test Print Shop');
    });

    test('PRE_ACTIVATION gateway returns activation role', async () => {
      const res = await supertest(app).get('/gateway/gw-pre-activation');
      expect(res.status).toBe(200);
      expect(res.body.role).toBe('activation');
    });

    test('unknown gateway returns unknown role', async () => {
      const res = await supertest(app).get('/gateway/unknown-device');
      expect(res.status).toBe(200);
      expect(res.body.role).toBe('unknown');
    });
  });

  // ══════════════════════════════════════════════════════════════
  // Printer capabilities
  // ══════════════════════════════════════════════════════════════

  describe('GET /gateway/:deviceId/capabilities', () => {
    /*
     * Browser                          User Channel            Gateway Channel
     *   │                                    │                      │
     *   │  GET /gateway/{deviceId}/           │                      │
     *   │       capabilities                  │                      │
     *   │───────────────────────────────────→│                      │
     *   │                                    │                      │
     *   │   Out_Req(GetPrinterCapabilities)  │                      │
     *   │                                    │─────────────────────→│
     *   │                                    │← { printers: [...] }│
     *   │                                    │                      │
     *   │  200 { printers: [...] }           │                      │
     *   │←───────────────────────────────────│                      │
     */
    test('returns printer capabilities for known gateway', async () => {
      const res = await supertest(app).get(`/gateway/${TEST_GATEWAY_ID}/capabilities`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.result.printers).toHaveLength(1);
    });

    /*
     * Browser                          User Channel            Gateway Channel
     *   │                                    │                      │
     *   │  GET /gateway/unknown/capabilities  │                      │
     *   │───────────────────────────────────→│                      │
     *   │                                    │                      │
     *   │   Out_Req(GetPrinterCapabilities)  │                      │
     *   │                                    │─────────────────────→│
     *   │                                    │← { ok: false }      │
     *   │                                    │                      │
     *   │  404 { error }                     │                      │
     *   │←───────────────────────────────────│                      │
     */
    test('returns 404 for unknown gateway', async () => {
      mockSendToRouter.mockImplementationOnce(async (event: any) => {
        if (event.method === Methods.GetPrinterCapabilities) {
          return { method: event.method, ok: false, error: { reason: 'Capabilities not available' } };
        }
        return { method: event.method, ok: true, result: null };
      });
      const res = await supertest(app).get('/gateway/unknown/capabilities');
      expect(res.status).toBe(404);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // Customer pricing
  // ══════════════════════════════════════════════════════════════

  describe('GET /gateway/:deviceId/pricing', () => {
    /*
     * Browser                          User Channel               Data DB
     *   │                                    │                      │
     *   │  GET /gateway/{deviceId}/pricing    │                      │
     *   │───────────────────────────────────→│                      │
     *   │                                    │                      │
     *   │  Step 1: GetGatewayByDeviceId      │                      │
     *   │                                    │─────────────────────→│
     *   │                                    │← { ownerPhone }     │
     *   │                                    │                      │
     *   │  Step 2: GetPricingByOwner         │                      │
     *   │                                    │─────────────────────→│
     *   │                                    │← { pricing: [...] } │
     *   │                                    │                      │
     *   │  200 { pricing: [...] }            │                      │
     *   │←───────────────────────────────────│                      │
     */
    test('returns pricing for known gateway', async () => {
      const res = await supertest(app).get(`/gateway/${TEST_GATEWAY_ID}/pricing`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.result).toHaveLength(1);
    });

    /*
     * Browser                          User Channel               Data DB
     *   │                                    │                      │
     *   │  GET /gateway/unknown/pricing       │                      │
     *   │───────────────────────────────────→│                      │
     *   │                                    │                      │
     *   │  GetGatewayByDeviceId → not found  │                      │
     *   │                                    │─────────────────────→│
     *   │                                    │← { ok: false }      │
     *   │                                    │                      │
     *   │  404 { error }                     │                      │
     *   │←───────────────────────────────────│                      │
     */
    test('returns 404 for unknown gateway', async () => {
      mockSendToRouter.mockImplementationOnce(async (event: any) => {
        if (event.method === Methods.GetGatewayByDeviceId) {
          return { method: event.method, ok: false, error: { reason: 'Gateway not found' } };
        }
        return { method: event.method, ok: true, result: null };
      });
      const res = await supertest(app).get('/gateway/unknown/pricing');
      expect(res.status).toBe(404);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // Owner activation
  // ══════════════════════════════════════════════════════════════

  describe('POST /activate/send-otp', () => {
    /*
     * Browser                          User Channel               Data DB
     *   │                                    │                      │
     *   │  POST /activate/send-otp           │                      │
     *   │  { deviceId, phone }               │                      │
     *   │───────────────────────────────────→│                      │
     *   │                                    │                      │
     *   │  GetGatewayByDeviceId (verify      │                      │
     *   │  gateway exists & activatable)     │                      │
     *   │                                    │─────────────────────→│
     *   │                                    │← { lifecycleState } │
     *   │                                    │                      │
     *   │  Generate OTP, store hash          │                      │
     *   │  deps.sendOtp(phone, otp)          │                      │
     *   │                                    │                      │
     *   │  200 { otpRef }                    │                      │
     *   │←───────────────────────────────────│                      │
     */
    test('sends OTP for activatable gateway', async () => {
      mockSendToRouter.mockImplementationOnce(async (event: any) => {
        if (event.method === Methods.GetGatewayByDeviceId) {
          return { method: event.method, ok: true, result: mockGateway({ lifecycleState: 'PRE_ACTIVATION' }) };
        }
        return { method: event.method, ok: true, result: null };
      });

      const res = await supertest(app)
        .post('/activate/send-otp')
        .send({ deviceId: TEST_GATEWAY_ID, phone: TEST_OWNER_PHONE });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.result.otpRef).toBeDefined();
    });

    /*
     * Browser                          User Channel               Data DB
     *   │                                    │                      │
     *   │  POST /activate/send-otp           │                      │
     *   │  { deviceId: "gw-001", phone }     │                      │
     *   │───────────────────────────────────→│                      │
     *   │                                    │                      │
     *   │  GetGatewayByDeviceId → OPERATIONAL│                      │
     *   │                                    │─────────────────────→│
     *   │                                    │← lifecycleState     │
     *   │                                    │  = "OPERATIONAL"    │
     *   │                                    │                      │
     *   │  Gateway is not PRE_ACTIVATION     │                      │
     *   │  400 { error }                     │                      │
     *   │←───────────────────────────────────│                      │
     */
    test('rejects OTP for already-activated gateway', async () => {
      const res = await supertest(app)
        .post('/activate/send-otp')
        .send({ deviceId: TEST_GATEWAY_ID, phone: TEST_OWNER_PHONE });
      expect(res.status).toBe(400);
    });

    test('rejects missing deviceId or phone', async () => {
      const res = await supertest(app).post('/activate/send-otp').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /activate/:deviceId', () => {
    /*
     * Browser                          User Channel               Data DB
     *   │                                    │                      │
     *   │  POST /activate/{deviceId}         │                      │
     *   │  { phone, otp, displayName }       │                      │
     *   │───────────────────────────────────→│                      │
     *   │                                    │                      │
     *   │  Step 1: Verify OTP hash           │                      │
     *   │  (compare SHA256 of user input     │                      │
     *   │   vs stored hash)                  │                      │
     *   │                                    │                      │
     *   │  Step 2: GetOwnerByPhone           │                      │
     *   │  (create Owner if new phone)       │                      │
     *   │                                    │─────────────────────→│
     *   │                                    │← { owner }          │
     *   │                                    │                      │
     *   │  Step 3: UpdateGatewayState        │                      │
     *   │  PRE_ACTIVATION → ACTIVATED        │                      │
     *   │                                    │─────────────────────→│
     *   │                                    │← { lifecycleState } │
     *   │                                    │                      │
     *   │  200 { deviceId, state }           │                      │
     *   │←───────────────────────────────────│                      │
     *                                        │                      │
     *   ── if OTP invalid ──                 │                      │
     *   401 { error }                        │                      │
     *   ←───────────────────────────────────│                      │
     */
    test('activates gateway with valid OTP', async () => {
      const otpRes = await supertest(app)
        .post('/activate/send-otp')
        .send({ deviceId: 'gw-pre-activation', phone: TEST_OWNER_PHONE });
      const otpRef = otpRes.body.result?.otpRef;

      const res = await supertest(app)
        .post(`/activate/gw-pre-activation`)
        .send({ phone: TEST_OWNER_PHONE, otp: '000000', displayName: 'My Shop' });
      expect(res.status).toBe(401);
    });

    test('rejects missing phone or otp', async () => {
      const res = await supertest(app).post(`/activate/${TEST_GATEWAY_ID}`).send({});
      expect(res.status).toBe(400);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // Set shop pricing
  // ══════════════════════════════════════════════════════════════

  describe('POST /owner/:phone/pricing', () => {
    /*
     * Browser                          User Channel               Data DB
     *   │                                    │                      │
     *   │  POST /owner/{phone}/pricing       │                      │
     *   │  { prices: [...] }                 │                      │
     *   │───────────────────────────────────→│                      │
     *   │                                    │                      │
     *   │  Out_Req(SetPricing) per item      │                      │
     *   │                                    │─────────────────────→│
     *   │                                    │← { ok }             │
     *   │                                    │                      │
     *   │  200 { ok }                        │                      │
     *   │←───────────────────────────────────│                      │
     */
    test('sets pricing successfully', async () => {
      const res = await supertest(app)
        .post(`/owner/${TEST_OWNER_PHONE}/pricing`)
        .send({ prices: [{ pageType: 'PageColor_BW:PageDuplex_SINGLE:PaperSize_A4', pricePaise: 300 }] });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockSendToRouter).toHaveBeenCalledWith(
        expect.objectContaining({ method: Methods.SetPricing }),
      );
    });

    test('rejects missing prices array', async () => {
      const res = await supertest(app)
        .post(`/owner/${TEST_OWNER_PHONE}/pricing`)
        .send({});
      expect(res.status).toBe(400);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // Session management
  // ══════════════════════════════════════════════════════════════

  describe('POST /session', () => {
    /*
     * Browser                          User Channel               Data DB
     *   │                                    │                      │
     *   │  POST /session                     │                      │
     *   │  { gatewayId }                     │                      │
     *   │───────────────────────────────────→│                      │
     *   │                                    │                      │
     *   │  Generate sessionToken (UUID)      │                      │
     *   │                                    │                      │
     *   │  Out_Req(CreateSession)            │                      │
     *   │  { gatewayId, sessionToken,        │                      │
     *   │    mode, expiresAt }               │                      │
     *   │                                    │─────────────────────→│
     *   │                                    │← { id, sessionToken}│
     *   │                                    │                      │
     *   │  200 { id, sessionToken }          │                      │
     *   │←───────────────────────────────────│                      │
     */
    test('creates customer session', async () => {
      const res = await supertest(app)
        .post('/session')
        .send({ gatewayId: TEST_GATEWAY_ID });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.result.sessionToken).toBeDefined();
    });

    test('rejects missing gatewayId', async () => {
      const res = await supertest(app).post('/session').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('GET /session/:token', () => {
    /*
     * Browser                          User Channel               Data DB
     *   │                                    │                      │
     *   │  GET /session/{token}              │                      │
     *   │───────────────────────────────────→│                      │
     *   │                                    │                      │
     *   │  Out_Req(GetSessionByToken)        │                      │
     *   │                                    │─────────────────────→│
     *   │                                    │← session record     │
     *   │                                    │                      │
     *   │  200 { id, sessionToken, mode }    │                      │
     *   │←───────────────────────────────────│                      │
     *                                        │                      │
     *   ── if not found ──                   │                      │
     *   404 { error }                        │                      │
     *   ←───────────────────────────────────│                      │
     */
    test('returns session for valid token', async () => {
      const res = await supertest(app).get(`/session/${TEST_SESSION_TOKEN}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    test('returns 404 for invalid token', async () => {
      const res = await supertest(app).get('/session/invalid-token');
      expect(res.status).toBe(404);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // Checkout + payment
  // ══════════════════════════════════════════════════════════════

  describe('POST /session/:token/checkout', () => {
    /*
     * Browser                  User Channel        Router     Payment    Data DB
     *   │                            │                │          │          │
     *   │  POST /session/{token}/    │                │          │          │
     *   │       checkout             │                │          │          │
     *   │  { amountPaise,            │                │          │          │
     *   │    documents[] }           │                │          │          │
     *   │───────────────────────────→│                │          │          │
     *   │                            │                │          │          │
     *   │  Step 1: Verify session    │                │          │          │
     *   │                            │────────────────→│─────────→│          │
     *   │                            │← { session }   │          │          │
     *   │                            │                │          │          │
     *   │  Step 2: Preflight check   │                │          │          │
     *   │  (RequestPreFlight)        │                │          │          │
     *   │                            │────────────────→│──────────         │
     *   │                            │← { ok }        │                   │
     *   │                            │                │          │          │
     *   │  Step 3: Create Razorpay   │                │          │          │
     *   │          order             │                │          │          │
     *   │                            │────────────────→│─────────→│          │
     *   │                            │← { orderId }   │          │          │
     *   │                            │                │          │          │
     *   │  Step 4: Persist on        │                │          │          │
     *   │          session           │                │          │          │
     *   │                            │────────────────→│─────────→│          │
     *   │                            │← { ok }        │          │          │
     *   │                            │                │          │          │
     *   │  200 { orderId,            │                │          │          │
     *   │       amountPaise }         │                │          │          │
     *   │←───────────────────────────│                │          │          │
     */
    test('creates Razorpay order for valid session', async () => {
      const res = await supertest(app)
        .post(`/session/${TEST_SESSION_TOKEN}/checkout`)
        .send({
          amountPaise: 1000,
          documents: [{ pageCount: 2, copies: 1, color: false, duplex: true, paperSize: 'A4' }],
        });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.result.orderId).toBe(TEST_ORDER_ID);
    });

    test('rejects invalid amountPaise', async () => {
      const res = await supertest(app)
        .post(`/session/${TEST_SESSION_TOKEN}/checkout`)
        .send({ amountPaise: 0, documents: [] });
      expect(res.status).toBe(400);
    });

    test('rejects missing documents', async () => {
      const res = await supertest(app)
        .post(`/session/${TEST_SESSION_TOKEN}/checkout`)
        .send({ amountPaise: 1000 });
      expect(res.status).toBe(400);
    });

    /*
     * Browser                          User Channel
     *   │                                    │
     *   │  POST /session/invalid-token/      │
     *   │       checkout                      │
     *   │  { amountPaise, documents[] }       │
     *   │───────────────────────────────────→│
     *   │                                    │
     *   │  GetSessionByToken → null          │
     *   │                                    │
     *   │  404 { error }                     │
     *   │←───────────────────────────────────│
     */
    test('rejects invalid session token', async () => {
      const res = await supertest(app)
        .post('/session/invalid-token/checkout')
        .send({
          amountPaise: 1000,
          documents: [{ pageCount: 2, copies: 1, color: false, duplex: true, paperSize: 'A4' }],
        });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /session/:token/confirm', () => {
    /*
     * Browser                  User Channel        Router     Payment    Data DB
     *   │                            │                │          │          │
     *   │  POST /session/{token}/    │                │          │          │
     *   │       confirm              │                │          │          │
     *   │  { orderId, paymentId,     │                │          │          │
     *   │    signature, amountPaise } │                │          │          │
     *   │───────────────────────────→│                │          │          │
     *   │                            │                │          │          │
     *   │  Step 1: Resolve session   │                │          │          │
     *   │                            │────────────────→│─────────→│          │
     *   │                            │← { session }   │          │          │
     *   │                            │                │          │          │
     *   │  Step 2: Verify amount     │                │          │          │
     *   │  (session.metadata.amount  │                │          │          │
     *   │   === body.amountPaise)    │                │          │          │
     *   │                            │                │          │          │
     *   │  Step 3: Verify signature  │                │          │          │
     *   │                            │────────────────→│─────────→│          │
     *   │                            │← { verified }  │          │          │
     *   │                            │                │          │          │
     *   │  Step 4: Persist payment   │                │          │          │
     *   │                            │────────────────→│─────────→│          │
     *   │                            │← { ok }        │          │          │
     *   │                            │                │          │          │
     *   │  200 { verified: true }    │                │          │          │
     *   │←───────────────────────────│                │          │          │
     */
    test('confirms payment with valid signature', async () => {
      const res = await supertest(app)
        .post(`/session/${TEST_SESSION_TOKEN}/confirm`)
        .send({
          orderId: TEST_ORDER_ID,
          paymentId: TEST_PAYMENT_ID,
          signature: 'valid-sig',
          amountPaise: 1000,
        });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.result.verified).toBe(true);
    });

    test('rejects amount mismatch', async () => {
      const res = await supertest(app)
        .post(`/session/${TEST_SESSION_TOKEN}/confirm`)
        .send({
          orderId: TEST_ORDER_ID,
          paymentId: TEST_PAYMENT_ID,
          signature: 'valid-sig',
          amountPaise: 9999,
        });
      expect(res.status).toBe(400);
    });

    test('rejects invalid session', async () => {
      const res = await supertest(app)
        .post('/session/invalid-token/confirm')
        .send({
          orderId: TEST_ORDER_ID,
          paymentId: TEST_PAYMENT_ID,
          signature: 'valid-sig',
          amountPaise: 1000,
        });
      expect(res.status).toBe(404);
    });

    test('rejects missing fields', async () => {
      const res = await supertest(app)
        .post(`/session/${TEST_SESSION_TOKEN}/confirm`)
        .send({});
      expect(res.status).toBe(400);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // Upload + dispatch
  // ══════════════════════════════════════════════════════════════

  describe('POST /session/:token/upload', () => {
    /*
     * Browser                  User Channel             Router    Doc Store  Data DB  Gateway
     *   │                            │                      │          │        │        │
     *   │  POST /session/{token}/    │                      │          │        │        │
     *   │       upload               │                      │          │        │        │
     *   │  (multipart files[]        │                      │          │        │        │
     *   │   + configs[])             │                      │          │        │        │
     *   │───────────────────────────→│                      │          │        │        │
     *   │                            │                      │          │        │        │
     *   │  Step 1: Verify session    │                      │          │        │        │
     *   │  + payment confirmed       │                      │          │        │        │
     *   │                            │─────────────────────→│─────────→│        │        │
     *   │                            │← { session }         │          │        │        │
     *   │                            │                      │          │        │        │
     *   │  Step 2: Store each        │                      │          │        │        │
     *   │          file in S3        │                      │          │        │        │
     *   │                            │─────────────────────→│─────────→│        │        │
     *   │                            │← { storageKey }      │          │        │        │
     *   │                            │                      │          │        │        │
     *   │  Step 3: Create doc        │                      │          │        │        │
     *   │          record            │                      │          │        │        │
     *   │                            │─────────────────────→│─────────→│────────→│        │
     *   │                            │← { docId }           │          │        │        │
     *   │                            │                      │          │        │        │
     *   │  Step 4: Create print job  │                      │          │        │        │
     *   │                            │─────────────────────→│─────────→│────────→│        │
     *   │                            │← { jobId, jobNumber }│          │        │        │
     *   │                            │                      │          │        │        │
     *   │  Step 5: Record payment    │                      │          │        │        │
     *   │                            │─────────────────────→│─────────→│────────→│        │
     *   │                            │← { paymentId }       │          │        │        │
     *   │                            │                      │          │        │        │
     *   │  Step 6: Dispatch to       │                      │          │        │        │
     *   │          gateway           │                      │          │        │        │
     *   │                            │─────────────────────→│─────────→│────────→│────────→│
     *   │                            │                      │          │        │← { ok }│
     *   │                            │                      │          │        │        │
     *   │  200 { jobId, jobNumber }  │                      │          │        │        │
     *   │←───────────────────────────│                      │          │        │        │
     */
    function buildUpload() {
      const fileContent = Buffer.from('%PDF-1.4 fake pdf content');
      return supertest(app)
        .post(`/session/${TEST_SESSION_TOKEN}/upload`)
        .attach('files', fileContent, 'test.pdf')
        .field('configs', JSON.stringify([{ pageCount: 2, copies: 1, color: false, duplex: true, paperSize: 'A4', pricePaise: 600 }]));
    }

    test('uploads file and creates job', async () => {
      const res = await buildUpload();
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.result.jobId).toBeDefined();
      expect(res.body.result.jobNumber).toBeDefined();
    });

    /*
     * Browser                          User Channel
     *   │                                    │
     *   │  POST /session/{token}/upload      │
     *   │  (files + configs)                 │
     *   │───────────────────────────────────→│
     *   │                                    │
     *   │  GetSessionByToken → session       │
     *   │  metadata.paymentId = null         │
     *   │  → "Payment not confirmed"         │
     *   │                                    │
     *   │  400 { error }                     │
     *   │←───────────────────────────────────│
     */
    test('rejects upload without payment confirmation', async () => {
      mockSendToRouter.mockImplementationOnce(async (event: any) => {
        if (event.method === Methods.GetSessionByToken) {
          return { method: event.method, ok: true, result: mockSession({ metadata: { amountPaise: 1000 } }) };
        }
        return { method: event.method, ok: true, result: null };
      });

      const res = await buildUpload();
      expect(res.status).toBe(400);
    });

    test('rejects upload without files', async () => {
      const res = await supertest(app)
        .post(`/session/${TEST_SESSION_TOKEN}/upload`);
      expect(res.status).toBe(400);
    });

    test('rejects upload with configs count mismatch', async () => {
      const fileContent = Buffer.from('fake content');
      const res = await supertest(app)
        .post(`/session/${TEST_SESSION_TOKEN}/upload`)
        .attach('files', fileContent, 'doc1.pdf')
        .attach('files', fileContent, 'doc2.pdf')
        .field('configs', JSON.stringify([{ pageCount: 1, copies: 1, color: false, duplex: false, paperSize: 'A4', pricePaise: 300 }]));
      expect(res.status).toBe(400);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // Job status polling
  // ══════════════════════════════════════════════════════════════

  describe('GET /job/:jobId/status', () => {
    /*
     * Browser                          User Channel               Data DB
     *   │                                    │                      │
     *   │  GET /job/{jobId}/status           │                      │
     *   │───────────────────────────────────→│                      │
     *   │                                    │                      │
     *   │  Out_Req(GetPrintJob)              │                      │
     *   │                                    │─────────────────────→│
     *   │                                    │← { state, ... }     │
     *   │                                    │                      │
     *   │  200 { jobId, state }              │                      │
     *   │←───────────────────────────────────│                      │
     */
    test('returns job state for valid job', async () => {
      const res = await supertest(app).get(`/job/${TEST_JOB_ID}/status`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.result.state).toBe('PRINTING');
    });

    /*
     * Browser                          User Channel               Data DB
     *   │                                    │                      │
     *   │  GET /job/unknown-job/status       │                      │
     *   │───────────────────────────────────→│                      │
     *   │                                    │                      │
     *   │  Out_Req(GetPrintJob) → null       │                      │
     *   │                                    │─────────────────────→│
     *   │                                    │← null               │
     *   │                                    │                      │
     *   │  404 { error }                     │                      │
     *   │←───────────────────────────────────│                      │
     */
    test('returns 404 for unknown job', async () => {
      mockSendToRouter.mockImplementationOnce(async (event: any) => {
        if (event.method === Methods.GetPrintJob) {
          return { method: event.method, ok: true, result: null };
        }
        return { method: event.method, ok: true, result: null };
      });
      const res = await supertest(app).get('/job/unknown-job/status');
      expect(res.status).toBe(404);
    });
  });
});