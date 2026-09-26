import crypto from 'crypto';
import { Readable } from 'stream';
import type { Router } from 'express';
import multer from 'multer';
import {Methods} from './types'
import type{ Out_Us, Out_Req, In_Resp, Contract, PrintDocument, JobDoc, PrintCfg } from './types';

export type UserChannelDeps = {
  sendToRouter: (event: Out_Req | Out_Us) => Promise<In_Resp | void>;
  httpRouter: Router;
  sendOtp: (phone: string, otp: string) => Promise<void>;
  sessionTtlMs: number;
  apiBaseUrl: string; // Base URL for artifact download, e.g. "http://localhost:3000"
};

export type UserChannel = {
  stop(): Promise<void>;
};

// In-memory OTP store. Keyed by phone number.
const otpStore = new Map<string, { hash: string; expiresAt: number }>();
// In-memory artifact auth tokens, keyed by jobId.
// Validated by the router when a gateway downloads an artifact.
export const artifactAuthTokens = new Map<string, { authToken: string; expiresAt: number }>();

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
    const gwStateResult = (gwCheck.result as Contract[typeof Methods.GetGatewayByDeviceId]['result']);
    if (!gwStateResult) {
      throw new Error('Gateway not found');
    }
    const lifecycleState = gwStateResult.lifecycleState; 
    if (lifecycleState !== 'PRE_ACTIVATION' && lifecycleState !== undefined) {
      throw new Error(`Gateway is ${lifecycleState}, not in PRE_ACTIVATION`);
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

    if (!ownerResp.ok || !ownerResp.result) {
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
  // pageType uses colon-separated positional dimensions:
  // "Color_BW:Duplex_Single:Size_A4". Data-db channel parses
  // and applies defaults for missing trailing values.

  async function setShopPricing(ownerPhone: string, prices: { pageType: string; pricePaise: number }[]): Promise<void> {
    for (const item of prices) {
      const resp = await deps.sendToRouter({
        method: Methods.SetPricing,
        args: { ownerPhone, pageType: item.pageType, pricePaise: item.pricePaise },
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
    const { prices } = req.body as { prices?: { pageType: string; pricePaise: number }[] };

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

    if (!gwResp.ok) return res.json({ role: 'unknown', deviceId });

    const gw = gwResp.result as Contract[typeof Methods.GetGatewayByDeviceId]['result'];
    if (!gw) return res.json({ role: 'unknown', deviceId });

    switch (gw.lifecycleState) {
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

    if (!capResp.ok || !capResp.result) {
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

    if (!resp.ok || !resp.result) {
      return res.status(404).json({ ok: false, error: { reason: 'Session not found' } });
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
    const { amountPaise, documents } = req.body as { amountPaise?: number, documents?: PrintDocument[] };

    if (!amountPaise || amountPaise <= 0) {
      return res.status(400).json({ ok: false, error: { reason: 'Invalid amountPaise' } });
    } else if(!documents || !Array.isArray(documents)) {
      return res.status(400).json({ ok: false, error: { reason: 'No documents provided or documents in improper fromat' } });
    }

    // Verify session exists before creating order
    // Security again with fake api calls with bogus tokens
    const sessionResp = await deps.sendToRouter({
      method: Methods.GetSessionByToken,
      args: { token },
    }) as In_Resp;

    if (!sessionResp.ok || !sessionResp.result) {
      return res.status(404).json({ ok: false, error: { reason: 'Session not found' } });
    }

    const session = sessionResp.result as Contract[typeof Methods.GetSessionByToken]['result'];
    if (!session) {
      return res.status(404).json({ ok: false, error: { reason: 'Session not found' } });
    }

    const preFlightResp = await deps.sendToRouter({method: Methods.RequestPreFlight, args: {deviceId: session.gatewayId, documents: documents }}) as In_Resp;
    if (!preFlightResp.ok) {
      return res.status(404).json({ ok: false, error: { reason: 'Printer(s) offline' } });        
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

    // Persist order info + checkout docs on session for upload-time verification
    await deps.sendToRouter({
      method: Methods.UpdateSessionMetadata,
      args: { sessionId: session.id, metadata: { orderId: order.orderId, amountPaise: order.amountPaise, checkoutDocs: documents } },
    }) as In_Resp;

    res.json({ ok: true, result: { orderId: order.orderId, amountPaise: order.amountPaise } });
  });

  // ══════════════════════════════════════════════════════════════
  // ConfirmPayment
  // ══════════════════════════════════════════════════════════════
  //
  // Razorpay redirects back after payment. Verify signature + amount.
  // Job + payment records created in UploadDocument (§11).

  deps.httpRouter.post('/session/:token/confirm', async (req, res) => {
    const { token } = req.params;
    const { orderId, paymentId, signature, amountPaise } = req.body as {
      orderId?: string; paymentId?: string; signature?: string; amountPaise?: number;
    };

    if (!orderId || !paymentId || !signature || !amountPaise) {
      res.status(400).json({ ok: false, error: { reason: 'Missing orderId, paymentId, signature, or amountPaise' } });
      return;
    }

    // Step 1: resolve session → verify it exists, read stored order info
    const sessionResp = await deps.sendToRouter({
      method: Methods.GetSessionByToken,
      args: { token },
    }) as In_Resp;

    if (!sessionResp.ok || !sessionResp.result) {
      res.status(404).json({ ok: false, error: { reason: 'Session not found' } });
      return;
    }

    const session = sessionResp.result as Contract[typeof Methods.GetSessionByToken]['result'];
    if (!session) {
      res.status(404).json({ ok: false, error: { reason: 'Session not found' } });
      return;
    }

    // Step 2: verify FE-sent amount matches what was stored at checkout
    const storedAmount = (session.metadata as Record<string, unknown> | null | undefined)?.amountPaise as number | undefined;
    if (storedAmount !== amountPaise) {
      res.status(400).json({ ok: false, error: { reason: 'Amount mismatch' } });
      return;
    }

    // Step 3: verify Razorpay signature via payment channel
    const verifyResp = await deps.sendToRouter({
      method: Methods.VerifyPayment,
      args: { orderId, paymentId, signature },
    }) as In_Resp;

    if (!verifyResp.ok) {
      res.status(401).json({ ok: false, error: { reason: verifyResp.error.reason } });
      return;
    }

    // Persist payment confirmation on session
    await deps.sendToRouter({
      method: Methods.UpdateSessionMetadata,
      args: { sessionId: session.id, metadata: { orderId, paymentId, verifiedAt: new Date().toISOString() } },
    }) as In_Resp;

    res.json({ ok: true, result: { verified: true } });
  });

  // ══════════════════════════════════════════════════════════════
  // Multer setup for file uploads
  // ══════════════════════════════════════════════════════════════

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024, files: 10 },
  });

  // ══════════════════════════════════════════════════════════════
  // UploadDocument (Post-Payment)
  // ══════════════════════════════════════════════════════════════

  deps.httpRouter.post('/session/:token/upload', upload.fields([
    { name: 'files', maxCount: 10 },
    { name: 'configs', maxCount: 1 },
  ]), async (req, res) => {
    const { token } = req.params;

    try {
      const files = (req as any).files?.files as Express.Multer.File[] | undefined;
      // The string representation of the print config array
      const configsRaw = (req.body as Record<string, unknown>).configs as string;

      if (!files || files.length === 0) {
        return res.status(400).json({ ok: false, error: { reason: 'No files uploaded' } });
      }

      if (!configsRaw || configsRaw.length === 0) {
        return res.status(400).json({ ok: false, error: { reason: 'Missing configs' } });
      }
      
      const printCfgs: PrintCfg[] = []
      try{
        const configs = JSON.parse(configsRaw);
        if (!Array.isArray(configs) || configs.length !== files.length) throw new Error();

        //pageCount: 2, copies: 1, color: false, duplex: true, paperSize: 'A4', pricePaise: 600 }
        for(const config of configs) {
            const pageCount: number   = config.pageCount;
            const copies: number      = config.copies;
            const color: boolean      = config.colon
            const duplex: boolean     = config.duplex
            const paperSize: string   = config.paperSize
            const pricePaise: number  = config.pricePaise
            if (pageCount &&
                copies &&
                color &&
                duplex &&
                paperSize &&
                pricePaise)
            {
                throw new Error();
            }
            printCfgs.push({pageCount, color, copies, duplex, paperSize, pricePaise});
        }
      } catch{
        return res.status(400).json({ ok: false, error: { reason: `Invalid config JSON or missing fields or file no. and num config mismatch(no. of files files: ${files.length}): ${configsRaw}` } });
      }

      

       

      // Resolve session
      const sessionResp = await deps.sendToRouter({
        method: Methods.GetSessionByToken,
        args: { token },
      }) as In_Resp;

      if (!sessionResp.ok || !sessionResp.result) {
        return res.status(404).json({ ok: false, error: { reason: 'Session not found' } });
      }
      const session = sessionResp.result as NonNullable<Contract[typeof Methods.GetSessionByToken]['result']>;

      // Verify payment was confirmed
      const meta = (session.metadata ?? {}) as Record<string, unknown>;
      if (!meta.paymentId || !meta.verifiedAt) {
        return res.status(400).json({ ok: false, error: { reason: 'Payment not confirmed' } });
      }
      const storedAmountPaise = meta.amountPaise as number | undefined;
      if (!storedAmountPaise || storedAmountPaise <= 0) {
        return res.status(400).json({ ok: false, error: { reason: 'Invalid stored amount' } });
      }

      // Verify uploaded configs match checkout docs (integrity check)
      const checkoutDocs = meta.checkoutDocs as PrintDocument[] | undefined;
      if (Array.isArray(checkoutDocs) && checkoutDocs.length === printCfgs.length) {
        for (let i = 0; i < printCfgs.length; i++) {
          let cfg: PrintCfg = printCfgs[i];
          const chk = checkoutDocs[i];
          if (cfg.pageCount !== chk.pageCount || cfg.copies !== chk.copies ||
              cfg.color !== chk.color || cfg.duplex !== chk.duplex ||
              cfg.paperSize !== chk.paperSize) {
            return res.status(400).json({ ok: false, error: { reason: `Config mismatch at index ${i}` } });
          }
        }
      } else {
        return res.status(400).json({ ok: false, error: { reason: 'Uploaded docs count mismatches checkout quote' } });
      }

      // Store each file + create document record
      const jobDocs: JobDoc[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let cfg: PrintCfg = printCfgs[i];
        const storageId = crypto.randomUUID();

        const storeResp = await deps.sendToRouter({
          method: Methods.StoreArtifact,
          args: {
            jobId: storageId,
            body: Readable.from(file.buffer),
            contentType: file.mimetype,
            contentLength: file.size,
          },
        }) as In_Resp;

        if (!storeResp.ok) {
          return res.status(500).json({ ok: false, error: { reason: `Failed to store ${file.originalname}` } });
        }
        const { storageKey } = storeResp.result as { storageKey: string };

        const docResp = await deps.sendToRouter({
          method: Methods.CreateDocument,
          args: {
            sessionToken: token,
            originalName: file.originalname,
            mimeType: file.mimetype,
            storageKey,
            source: 'phone_upload',
            fileSize: file.size,
            pageCount: cfg.pageCount,
          },
        }) as In_Resp;

        if (!docResp.ok) {
          return res.status(500).json({ ok: false, error: { reason: `Failed to create document record for ${file.originalname}` } });
        }
        const { id: docId } = docResp.result as { id: string };
        jobDocs.push({
          documentId: docId,
          pageCount: cfg.pageCount,
          copies: cfg.copies,
          color: cfg.color,
          duplex: cfg.duplex,
          paperSize: cfg.paperSize,
          pricePaise: cfg.pricePaise,
        });
      }

      // Create print job
      const totalPages = jobDocs.reduce((sum, d) => sum + d.pageCount * d.copies, 0);
      const totalPricePaise = jobDocs.reduce((sum, d) => sum + d.pricePaise, 0);
      const jobNumber = `JOB-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

      const jobResp = await deps.sendToRouter({
        method: Methods.CreatePrintJob,
        args: {
          jobNumber,
          gatewayId: session.gatewayId,
          sessionId: session.id,
          totalPages,
          pricePaise: totalPricePaise,
          documents: jobDocs,
        },
      }) as In_Resp;

      if (!jobResp.ok) {
        return res.status(500).json({ ok: false, error: { reason: jobResp.error.reason } });
      }
      const { id: jobId } = jobResp.result as { id: string; jobNumber: string };

      // Record payment
      const payResp = await deps.sendToRouter({
        method: Methods.CreatePayment,
        args: { jobId, amountPaise: storedAmountPaise, provider: 'razorpay' },
      }) as In_Resp;

      if (!payResp.ok) {
        console.error(`Failed to record payment for job ${jobId}: ${payResp.error.reason}`);
      }

      // Generate auth token for artifact download
      const authToken = crypto.randomUUID();
      artifactAuthTokens.set(jobId, { authToken, expiresAt: Date.now() + 60 * 60 * 1000 });

      // Dispatch to gateway
      const artifactUrl = `${deps.apiBaseUrl}/api/gateway/jobs/${jobId}/artifact`;
      const dispatchResp = await deps.sendToRouter({
        method: Methods.RequestPrint,
        args: {
          deviceId: session.gatewayId,
          jobId,
          artifactUrl,
          authToken,
          documents: jobDocs.map(d => ({
            pageCount: d.pageCount, copies: d.copies, color: d.color,
            duplex: d.duplex, paperSize: d.paperSize, pricePaise: d.pricePaise,
          })),
        },
      }) as In_Resp;

      if (!dispatchResp.ok) {
        console.error(`Failed to dispatch job ${jobNumber}: ${dispatchResp.error.reason}`);
      }

      res.json({ ok: true, result: { jobId, jobNumber } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ ok: false, error: { reason: message } });
    }
  });

  // ══════════════════════════════════════════════════════════════
  // GetJobStatus
  // ══════════════════════════════════════════════════════════════

  deps.httpRouter.get('/job/:jobId/status', async (req, res) => {
    const { jobId } = req.params;

    const resp = await deps.sendToRouter({
      method: Methods.GetPrintJob,
      args: { id: jobId },
    }) as In_Resp;

    if (!resp.ok) {
      return res.status(404).json({ ok: false, error: { reason: 'Job not found' } });
    }

    const job = resp.result as { id: string; state: string } | null;
    if (!job) {
      return res.status(404).json({ ok: false, error: { reason: 'Job not found' } });
    }

    res.json({ ok: true, result: { jobId: job.id, state: job.state } });
  });

  // ── Public API ──

  return {
    stop: async () => {
      otpStore.clear();
      artifactAuthTokens.clear();
    },
  };
}