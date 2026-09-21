import crypto from 'crypto';
import type { Router } from 'express';
import type { Out_Us } from './types';

export type UserChannelDeps = {
  sendToRouter: (event: { method: string; args: Record<string, unknown> } | Out_Us) => Promise<{ method: string; ok: boolean; result?: unknown; error?: { reason: string } }>;
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

  function generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  function hashOtp(otp: string): string {
    return crypto.createHash('sha256').update(otp).digest('hex');
  }

  // ══════════════════════════════════════════════════════════════
  // InitiateOwnerOtp
  // ══════════════════════════════════════════════════════════════

  async function initiateOwnerOtp(phone: string): Promise<{ otpRef: string }> {
    const otp = generateOtp();
    const hash = hashOtp(otp);

    await deps.sendOtp(phone, otp);
    otpStore.set(phone, { hash, expiresAt: Date.now() + 5 * 60 * 1000 });

    return { otpRef: crypto.randomUUID() };
  }

  // ══════════════════════════════════════════════════════════════
  // ActivateGateway
  // ══════════════════════════════════════════════════════════════

  async function activateGateway(deviceId: string, phone: string, otp: string, displayName?: string): Promise<{ deviceId: string; lifecycleState: string }> {
    // Step 1: Verify OTP
    const entry = otpStore.get(phone);
    if (!entry || entry.expiresAt < Date.now() || entry.hash !== hashOtp(otp)) {
      throw new Error('Invalid or expired OTP');
    }
    otpStore.delete(phone);

    // Step 2: Look up or create owner
    const ownerResp = await deps.sendToRouter({
      method: 'getOwnerByPhone',
      args: { phone },
    });

    if (!ownerResp.ok || !(ownerResp.result as { phone?: string })?.phone) {
      const createResp = await deps.sendToRouter({
        method: 'createOwner',
        args: { phone, displayName: displayName ?? null },
      });
      if (!createResp.ok) {
        throw new Error('Failed to create owner');
      }
    }

    // Step 3: Set gateway to ACTIVATED
    const gwResp = await deps.sendToRouter({
      method: 'updateGatewayState',
      args: { deviceId, lifecycleState: 'ACTIVATED', ownerPhone: phone },
    });

    if (!gwResp.ok) {
      throw new Error('Failed to activate gateway');
    }

    const gw = gwResp.result as { deviceId: string; lifecycleState: string };
    return { deviceId: gw.deviceId, lifecycleState: gw.lifecycleState };
  }

  // ── HTTP Routes ──

  deps.httpRouter.post('/activate/send-otp', async (req, res) => {
    const { phone } = req.body as { phone?: string };
    if (!phone) {
      res.status(400).json({ error: 'Missing phone' });
      return;
    }

    try {
      const result = await initiateOwnerOtp(phone);
      res.json({ ok: true, result });
    } catch (err) {
      res.status(500).json({ ok: false, error: { reason: err instanceof Error ? err.message : 'Unknown error' } });
    }
  });

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

  // ── Public API ──

  return {
    stop: async () => {
      otpStore.clear();
    },
  };
}