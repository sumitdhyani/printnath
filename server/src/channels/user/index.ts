import crypto from 'crypto';
import type { Router } from 'express';
import {Methods} from './types'
import type{ Out_Us, Out_Req, In_Resp, Contract } from './types';

export type UserChannelDeps = {
  sendToRouter: (event: Out_Req | Out_Us) => Promise<In_Resp | void>;
  httpRouter: Router;
  sendOtp: (phone: string, otp: string) => Promise<void>;
  sessionTtlMs: number;
};

export type UserChannel = {
  stop(): Promise<void>;
};

// In-memory OTP store. Keyed by phone number.
const otpStore = new Map<string, { hash: string; expiresAt: number }>();

export async function initUserChannel(deps: UserChannelDeps): Promise<UserChannel> {
  // ── Config ──
  const sessionTtlMs = deps.sessionTtlMs;

  // ── Helpers ──

  function hashOtp(otp: string): string {
    return crypto.createHash('sha256').update(otp).digest('hex');
  }

  // ══════════════════════════════════════════════════════════════
  // InitiateOwnerOtp
  // ══════════════════════════════════════════════════════════════
  //
  // First verifies the gateway exists and is activatable,
  // then generates + sends OTP. Never waste SMS on a bad deviceId.

  async function initiateOwnerOtp(deviceId: string, phone: string): Promise<{ otpRef: string }> {
    // Check gateway exists and can be activated before spending SMS
    const gwCheck = await deps.sendToRouter({
      method: Methods.GetGatewayByDeviceId,
      args: { deviceId },
    }) as In_Resp;
    if (!gwCheck.ok) {
      throw new Error('Gateway not found');
    }
    const gwState = (gwCheck.result as Contract[typeof Methods.GetGatewayByDeviceId]['result'])?.lifecycleState;
    if (gwState !== 'PRE_ACTIVATION' && gwState !== undefined) {
      throw new Error(`Gateway is ${gwState}, not in PRE_ACTIVATION`);
    }

    // Generate + store + send OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hash = hashOtp(otp);

    await deps.sendOtp(phone, otp);
    otpStore.set(phone, { hash, expiresAt: Date.now() + 5 * 60 * 1000 });

    return { otpRef: crypto.randomUUID() };
  }

  // ══════════════════════════════════════════════════════════════
  // ActivateGateway
  // ══════════════════════════════════════════════════════════════

  async function activateGateway(deviceId: string, phone: string, otp: string, displayName?: string): Promise<{ deviceId: string; lifecycleState: string }>{
    // Step 1: Verify OTP
    const entry = otpStore.get(phone);
    if (!entry || entry.expiresAt < Date.now() || entry.hash !== hashOtp(otp)) {
      throw new Error('Invalid or expired OTP');
    }
    otpStore.delete(phone);

    // Step 2: Look up or create owner
    const ownerResp = await deps.sendToRouter({
      method: Methods.GetOwnerByPhone,
      args: { phone },
    }) as In_Resp;

    if (!ownerResp.ok || !(ownerResp.result as Contract[typeof Methods.GetOwnerByPhone]['result'])?.phone) {
      const createResp = await deps.sendToRouter({
        method: Methods.CreateOwner,
        args: { phone, displayName: displayName ?? undefined },
      }) as In_Resp;
      if (!createResp.ok) {
        throw new Error(createResp.error.reason);
      }
    }

    // Step 3: Set gateway to ACTIVATED
    const gwResp = await deps.sendToRouter({
      method: Methods.UpdateGatewayState,
      args: { deviceId, lifecycleState: 'ACTIVATED', ownerPhone: phone },
    }) as In_Resp;

    if (!gwResp.ok) {
      throw new Error(gwResp.error.reason);
    }

    const gw = gwResp.result as Contract[typeof Methods.UpdateGatewayState]['result'];
    return { deviceId: gw.deviceId, lifecycleState: gw.lifecycleState };
  }

  // ── HTTP Routes ──

  // Invoked when the user pushed the send-otp button
  deps.httpRouter.post('/activate/send-otp', async (req, res) => {
    const { deviceId, phone } = req.body as { deviceId?: string; phone?: string };
    if (!deviceId || !phone) {
      res.status(400).json({ error: 'Missing deviceId or phone' });
      return;
    }

    try {
      const result = await initiateOwnerOtp(deviceId, phone);
      res.json({ ok: true, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const status = message.includes('not found') || message.includes('not in') ? 400 : 500;
      res.status(status).json({ ok: false, error: { reason: message } });
    }
  });

  // Invoked when the user enters the otp
  deps.httpRouter.post('/activate/:deviceId', async (req, res) => {
    const { deviceId } = req.params;
    const { phone, otp, displayName } = req.body as { phone?: string; otp?: string; displayName?: string };

    if (!phone || !otp) {
      res.status(400).json({ error: 'Missing phone or otp' });
      return;
    }

    try {
      const result = await activateGateway(deviceId, phone, otp, displayName);
      res.json({ ok: true, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const status = message.includes('OTP') ? 401 : 500;
      res.status(status).json({ ok: false, error: { reason: message } });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // SetShopPricing
  // ══════════════════════════════════════════════════════════════
  //
  // Shop owner sets per-configuration prices. The composite key
  // is built from { pageType, paperSize, duplex } and stored as
  // a flat pageType string via data-db's setPricing.

  async function setShopPricing(ownerPhone: string, prices: { pageType: string; paperSize: string; duplex: boolean; pricePaise: number }[]): Promise<void> {
    for (const item of prices) {
      const compositeKey = `${item.pageType}|${item.duplex ? 'duplex' : 'single'}|${item.paperSize}`;
      const resp = await deps.sendToRouter({
        method: Methods.SetPricing,
        args: { ownerPhone, pageType: compositeKey, pricePaise: item.pricePaise },
      }) as In_Resp;
      if (!resp.ok) {
        throw new Error(resp.error.reason);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  // Set Pricing
  // ══════════════════════════════════════════════════════════════

  deps.httpRouter.post('/owner/:phone/pricing', async (req, res) => {
    const { phone } = req.params;
    const { prices } = req.body as { prices?: { pageType: string; paperSize: string; duplex: boolean; pricePaise: number }[] };

    if (!prices || !Array.isArray(prices)) {
      res.status(400).json({ error: 'Missing prices array' });
      return;
    }

    try {
      await setShopPricing(phone, prices);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: { reason: err instanceof Error ? err.message : 'Unknown error' } });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // Gateway Status (QR code entry point)
  // ══════════════════════════════════════════════════════════════

  deps.httpRouter.get('/gateway/:deviceId', async (req, res) => {
    const { deviceId } = req.params;

    const gwResp = await deps.sendToRouter({
      method: Methods.GetGatewayByDeviceId,
      args: { deviceId },
    }) as In_Resp;

    if (!gwResp.ok || !gwResp.result) {
      res.json({ role: 'unknown', deviceId });
      return;
    }

    const gw = gwResp.result as Contract[typeof Methods.GetGatewayByDeviceId]['result'];

    switch (gw?.lifecycleState) {
      case 'PRE_ACTIVATION':
        res.json({ role: 'activation', deviceId, state: gw.lifecycleState });
        break;
      case 'OPERATIONAL':
        res.json({ role: 'customer', deviceId, state: gw.lifecycleState, shopName: gw.name ?? null });
        break;
      default:
        res.json({ role: 'setup', deviceId, state: gw?.lifecycleState ?? 'UNKNOWN' });
        break;
    }
  });

  // ══════════════════════════════════════════════════════════════
  // Printer Capabilities
  // ══════════════════════════════════════════════════════════════

  deps.httpRouter.get('/gateway/:deviceId/capabilities', async (req, res) => {
    const { deviceId } = req.params;

    const capResp = await deps.sendToRouter({
      method: Methods.GetPrinterCapabilities,
      args: { deviceId },
    }) as In_Resp;

    if (!capResp.ok) {
      res.status(404).json({ error: 'Capabilities not available' });
      return;
    }

    res.json({ ok: true, result: capResp.result });
  });

  // ══════════════════════════════════════════════════════════════
  // Create Customer Session
  // ══════════════════════════════════════════════════════════════

  deps.httpRouter.post('/session', async (req, res) => {
    const { gatewayId } = req.body as { gatewayId?: string };
    if (!gatewayId) {
      res.status(400).json({ ok: false, error: { reason: 'Missing gatewayId' } });
      return;
    }

    const sessionToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + sessionTtlMs);

    const resp = await deps.sendToRouter({
      method: Methods.CreateSession,
      args: { gatewayId, sessionToken, mode: 'customer', expiresAt },
    }) as In_Resp;

    if (!resp.ok) {
      res.status(500).json({ ok: false, error: { reason: resp.error.reason } });
      return;
    }

    const result = resp.result as Contract[typeof Methods.CreateSession]['result'];
    res.json({ ok: true, result });
  });

  // ══════════════════════════════════════════════════════════════
  // Get Session
  // ══════════════════════════════════════════════════════════════

  deps.httpRouter.get('/session/:token', async (req, res) => {
    const { token } = req.params;

    const resp = await deps.sendToRouter({
      method: Methods.GetSessionByToken,
      args: { token },
    }) as In_Resp;

    if (!resp.ok) {
      res.status(404).json({ ok: false, error: { reason: 'Session not found' } });
      return;
    }

    const result = resp.result as Contract[typeof Methods.GetSessionByToken]['result'];
    res.json({ ok: true, result });
  });

  // ══════════════════════════════════════════════════════════════
  // Get Pricing (customer-facing, keyed by deviceId)
  // ══════════════════════════════════════════════════════════════
  //
  // Resolves deviceId → ownerPhone → pricing array.
  // No session needed — browser already has deviceId from QR scan.

  deps.httpRouter.get('/gateway/:deviceId/pricing', async (req, res) => {
    const { deviceId } = req.params;

    // Step 1: resolve gateway → ownerPhone
    const gwResp = await deps.sendToRouter({
      method: Methods.GetGatewayByDeviceId,
      args: { deviceId },
    }) as In_Resp;

    if (!gwResp.ok) {
      res.status(404).json({ ok: false, error: { reason: 'Gateway not found' } });
      return;
    }

    const gw = gwResp.result as Contract[typeof Methods.GetGatewayByDeviceId]['result'];
    if (!gw || !gw.ownerPhone) {
      res.status(400).json({ ok: false, error: { reason: 'Gateway has no owner' } });
      return;
    }

    // Step 2: get pricing for this owner
    const pricingResp = await deps.sendToRouter({
      method: Methods.GetPricingByOwner,
      args: { ownerPhone: gw.ownerPhone },
    }) as In_Resp;

    if (!pricingResp.ok) {
      res.status(500).json({ ok: false, error: { reason: pricingResp.error.reason } });
      return;
    }

    const pricing = pricingResp.result as Contract[typeof Methods.GetPricingByOwner]['result'];
    res.json({ ok: true, result: pricing });
  });

  // ══════════════════════════════════════════════════════════════
  // InitiateCheckout
  // ══════════════════════════════════════════════════════════════
  //
  // Customer taps Pay → create Razorpay order.
  // Amount calculated on FE from pricing + user config (pageType, copies, etc.).

  deps.httpRouter.post('/session/:token/checkout', async (req, res) => {
    const { token } = req.params;
    const { amountPaise } = req.body as { amountPaise?: number };

    if (!amountPaise || amountPaise <= 0) {
      res.status(400).json({ ok: false, error: { reason: 'Invalid amountPaise' } });
      return;
    }

    // Verify session exists before creating order
    const sessionResp = await deps.sendToRouter({
      method: Methods.GetSessionByToken,
      args: { token },
    }) as In_Resp;

    if (!sessionResp.ok || !sessionResp.result) {
      res.status(404).json({ ok: false, error: { reason: 'Session not found' } });
      return;
    }

    // Create Razorpay order via payment channel
    const orderResp = await deps.sendToRouter({
      method: Methods.CreateOrder,
      args: { amountPaise, receipt: token },
    }) as In_Resp;

    if (!orderResp.ok) {
      res.status(500).json({ ok: false, error: { reason: orderResp.error.reason } });
      return;
    }

    const order = orderResp.result as Contract[typeof Methods.CreateOrder]['result'];
    res.json({ ok: true, result: { orderId: order.orderId, amountPaise: order.amountPaise } });
  });

  // ── Public API ──

  return {
    stop: async () => {
      otpStore.clear();
    },
  };
}