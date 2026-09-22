import crypto from 'crypto';
import type { Router } from 'express';
import {Methods} from './types'
import type{ Out_Us, Out_Req, In_Resp } from './types';

export type UserChannelDeps = {
  sendToRouter: (event: Out_Req | Out_Us) => Promise<In_Resp | void>;
  httpRouter: Router;
  sendOtp: (phone: string, otp: string) => Promise<void>;
};

export type UserChannel = {
  stop(): Promise<void>;
};

// In-memory OTP store. Keyed by phone number.
const otpStore = new Map<string, { hash: string; expiresAt: number }>();

export async function initUserChannel(deps: UserChannelDeps): Promise<UserChannel> {
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
    const gwState = (gwCheck.result as { lifecycleState?: string })?.lifecycleState;
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

    if (!ownerResp.ok || !(ownerResp.result as { phone?: string })?.phone) {
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

    const gw = gwResp.result as { deviceId: string; lifecycleState: string };
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

    const gw = gwResp.result as { deviceId: string; lifecycleState?: string; ownerPhone?: string; shopName?: string };

    switch (gw.lifecycleState) {
      case 'PRE_ACTIVATION':
        res.json({ role: 'activation', deviceId, state: gw.lifecycleState });
        break;
      case 'OPERATIONAL':
        res.json({ role: 'customer', deviceId, state: gw.lifecycleState, shopName: gw.shopName ?? null });
        break;
      default:
        res.json({ role: 'setup', deviceId, state: gw.lifecycleState ?? 'UNKNOWN' });
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

  // ── Public API ──

  return {
    stop: async () => {
      otpStore.clear();
    },
  };
}