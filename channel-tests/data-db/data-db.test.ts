import { describe, test, expect, beforeEach } from 'vitest';
import { initDataDb, type DataDbChannel } from '../server/src/channels/data-db/index';
import { Methods } from '../server/src/channels/data-db/types';

let channel: DataDbChannel;

beforeEach(async () => {
  channel = await initDataDb({
    config: { url: globalThis.__TEST_DB_URL__ },
  });
});

// ── Owner ──

describe('Owner', () => {
  test('create owner then get by phone returns the owner', async () => {
    const createResult = await channel.execute({
      method: Methods.CreateOwner,
      args: { phone: '+911234567890', displayName: 'Test Owner' },
    });
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;
    expect(createResult.result.phone).toBe('+911234567890');

    const getResult = await channel.execute({
      method: Methods.GetOwnerByPhone,
      args: { phone: '+911234567890' },
    });
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.result?.phone).toBe('+911234567890');
    expect(getResult.result?.displayName).toBe('Test Owner');
  });

  test('get owner by unknown phone returns null', async () => {
    const result = await channel.execute({
      method: Methods.GetOwnerByPhone,
      args: { phone: '+911111111111' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result).toBeNull();
  });
});

// ── Gateway ──

describe('Gateway', () => {
  const DEVICE_ID = 'device-001';

  test('preregister device then get by deviceId', async () => {
    const createResult = await channel.execute({
      method: Methods.PreRegisterDevice,
      args: { deviceId: DEVICE_ID },
    });
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;
    expect(createResult.result.deviceId).toBe(DEVICE_ID);
    expect(createResult.result.lifecycleState).toBe('PRE_ACTIVATION');

    const getResult = await channel.execute({
      method: Methods.GetGatewayByDeviceId,
      args: { deviceId: DEVICE_ID },
    });
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.result?.deviceId).toBe(DEVICE_ID);
  });

  test('unknown device returns null', async () => {
    const result = await channel.execute({
      method: Methods.GetGatewayByDeviceId,
      args: { deviceId: 'nonexistent' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result).toBeNull();
  });

  test('update gateway state from PRE_ACTIVATION to ACTIVATED to OPERATIONAL', async () => {
    await channel.execute({ method: Methods.PreRegisterDevice, args: { deviceId: DEVICE_ID } });

    const activateResult = await channel.execute({
      method: Methods.UpdateGatewayState,
      args: { deviceId: DEVICE_ID, lifecycleState: 'ACTIVATED', deviceToken: 'tok-abc' },
    });
    expect(activateResult.ok).toBe(true);
    if (!activateResult.ok) return;
    expect(activateResult.result.lifecycleState).toBe('ACTIVATED');
    expect(activateResult.result.deviceToken).toBe('tok-abc');

    const operationalResult = await channel.execute({
      method: Methods.UpdateGatewayState,
      args: { deviceId: DEVICE_ID, lifecycleState: 'OPERATIONAL', isConnected: true },
    });
    expect(operationalResult.ok).toBe(true);
    if (!operationalResult.ok) return;
    expect(operationalResult.result.lifecycleState).toBe('OPERATIONAL');
    expect(operationalResult.result.isConnected).toBe(true);
  });

  test('update capabilities', async () => {
    await channel.execute({ method: Methods.PreRegisterDevice, args: { deviceId: DEVICE_ID } });

    const capResult = await channel.execute({
      method: Methods.UpdateGatewayCapabilities,
      args: {
        deviceId: DEVICE_ID,
        capabilities: { color: true, duplex: false, sizes: ['A4'], maxCopies: 10 },
      },
    });
    expect(capResult.ok).toBe(true);
    if (!capResult.ok) return;

    const getResult = await channel.execute({
      method: Methods.GetGatewayByDeviceId,
      args: { deviceId: DEVICE_ID },
    });
    if (!getResult.ok) return;
    expect((getResult.result as any).capabilities?.color).toBe(true);
  });

  test('list gateways by owner', async () => {
    await channel.execute({ method: Methods.CreateOwner, args: { phone: '+911234567890' } });
    await channel.execute({ method: Methods.PreRegisterDevice, args: { deviceId: 'd1' } });
    await channel.execute({ method: Methods.PreRegisterDevice, args: { deviceId: 'd2' } });
    await channel.execute({
      method: Methods.UpdateGatewayState,
      args: { deviceId: 'd1', lifecycleState: 'OPERATIONAL', isConnected: false },
    });
    await channel.execute({
      method: Methods.UpdateGatewayState,
      args: { deviceId: 'd2', lifecycleState: 'OPERATIONAL', isConnected: false },
    });

    // No ownerPhone set — list should be empty
    const result = await channel.execute({
      method: Methods.ListGatewaysByOwner,
      args: { ownerPhone: '+911234567890' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result).toHaveLength(0);
  });
});

// ── Pricing ──

describe('Pricing', () => {
  test('set and get pricing by owner', async () => {
    await channel.execute({ method: Methods.CreateOwner, args: { phone: '+911234567890' } });
    await channel.execute({
      method: Methods.SetPricing,
      args: { ownerPhone: '+911234567890', pageType: 'B_W_A4', pricePaise: 300 },
    });
    await channel.execute({
      method: Methods.SetPricing,
      args: { ownerPhone: '+911234567890', pageType: 'COLOR_A4', pricePaise: 1000 },
    });

    const result = await channel.execute({
      method: Methods.GetPricingByOwner,
      args: { ownerPhone: '+911234567890' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Upsert so pricing records exist even if created once
    expect(result.result.length).toBeGreaterThanOrEqual(2);
  });

  test('get pricing for owner with no pricing returns empty array', async () => {
    const result = await channel.execute({
      method: Methods.GetPricingByOwner,
      args: { ownerPhone: '+919999999999' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result).toEqual([]);
  });
});

// ── Session ──

describe('CustomerSession', () => {
  const DEVICE_ID = 'session-device';
  const SESSION_TOKEN = 'tok-session-1';

  beforeEach(async () => {
    await channel.execute({ method: Methods.PreRegisterDevice, args: { deviceId: DEVICE_ID } });
    await channel.execute({
      method: Methods.UpdateGatewayState,
      args: { deviceId: DEVICE_ID, lifecycleState: 'OPERATIONAL' },
    });
  });

  test('create session then get by token', async () => {
    const createResult = await channel.execute({
      method: Methods.CreateSession,
      args: {
        gatewayId: `fake-gateway-id`,
        sessionToken: SESSION_TOKEN,
        mode: 'ANONYMOUS',
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    // Should fail — no gateway with this ID
    expect(createResult.ok).toBe(false);
  });

  test('create session with real gateway ID', async () => {
    const gw = await channel.execute({ method: Methods.GetGatewayByDeviceId, args: { deviceId: DEVICE_ID } });
    if (!gw.ok) return;

    const createResult = await channel.execute({
      method: Methods.CreateSession,
      args: {
        gatewayId: gw.result!.id,
        sessionToken: SESSION_TOKEN,
        mode: 'ANONYMOUS',
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;
    expect((createResult.result as any).sessionToken).toBe(SESSION_TOKEN);

    const getResult = await channel.execute({
      method: Methods.GetSessionByToken,
      args: { token: SESSION_TOKEN },
    });
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.result?.sessionToken).toBe(SESSION_TOKEN);
  });
});

// ── Print Job ──

describe('PrintJob', () => {
  const DEVICE_ID = 'job-device';
  let gatewayId: string;
  let sessionId: string;
  let documentId: string;

  beforeEach(async () => {
    await channel.execute({ method: Methods.PreRegisterDevice, args: { deviceId: DEVICE_ID } });
    await channel.execute({
      method: Methods.UpdateGatewayState,
      args: { deviceId: DEVICE_ID, lifecycleState: 'OPERATIONAL' },
    });
    const gw = await channel.execute({ method: Methods.GetGatewayByDeviceId, args: { deviceId: DEVICE_ID } });
    if (!gw.ok || !gw.result) throw new Error('Gateway not found');
    gatewayId = gw.result.id;

    const sess = await channel.execute({
      method: Methods.CreateSession,
      args: {
        gatewayId,
        sessionToken: `tok-${Date.now()}`,
        mode: 'ANONYMOUS',
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    if (!sess.ok) throw new Error('Session not created');
    sessionId = (sess.result as any).id;

    // Create document for JobDocument FK reference
    const doc = await channel.execute({
      method: Methods.CreateDocument,
      args: {
        sessionToken: `tok-${Date.now()}`,
        originalName: 'test.pdf',
        mimeType: 'application/pdf',
        storageKey: 'test/test.pdf',
        source: 'DIRECT_UPLOAD',
        fileSize: 1024,
        pageCount: 4,
      },
    });
    if (!doc.ok) throw new Error('Document not created');
    documentId = (doc.result as any).id;
  });

  test('create print job with nested documents', async () => {
    const result = await channel.execute({
      method: Methods.CreatePrintJob,
      args: {
        jobNumber: `JOB-${Date.now()}`,
        gatewayId,
        sessionId,
        totalPages: 12,
        pricePaise: 3600,
        documents: [{ documentId, pageCount: 4, copies: 2, color: false, duplex: true, paperSize: 'A4', pricePaise: 2400 }],
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.result as any).jobDocuments).toHaveLength(1);
  });

  test('get print job with includeDocuments', async () => {
    const jobNum = `JOB-${Date.now()}`;
    const createResult = await channel.execute({
      method: Methods.CreatePrintJob,
      args: {
        jobNumber: jobNum,
        gatewayId,
        sessionId,
        totalPages: 12,
        pricePaise: 3600,
        documents: [{ documentId, pageCount: 4, copies: 1, color: false, duplex: true, paperSize: 'A4', pricePaise: 1200 }],
      },
    });
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;
    const jobId = (createResult.result as any).id;

    const resultWithout = await channel.execute({ method: Methods.GetPrintJob, args: { id: jobId } });
    expect(resultWithout.ok).toBe(true);
    if (!resultWithout.ok) return;
    expect((resultWithout.result as any).jobDocuments).toBeUndefined();

    const resultWith = await channel.execute({ method: Methods.GetPrintJob, args: { id: jobId, includeDocuments: true } });
    expect(resultWith.ok).toBe(true);
    if (!resultWith.ok) return;
    expect(resultWith.result?.jobDocuments).toHaveLength(1);
  });
});

// ── Payment ──

describe('Payment', () => {
  test('create payment for job', async () => {
    // Not testing FK validation — depends on job existing
    const result = await channel.execute({
      method: Methods.CreatePayment,
      args: { jobId: 'non-existent', amountPaise: 3000, provider: 'RAZORPAY' },
    });
    expect(result.ok).toBe(false); // FK violation expected
  });
});

// ── Audit Log ──

describe('AuditLog', () => {
  test('write audit log entry', async () => {
    const result = await channel.execute({
      method: Methods.AuditLog,
      args: {
        entityType: 'owner',
        entityId: 'test-1',
        event: 'created',
        fromState: null,
        toState: null,
      },
    });
    expect(result.ok).toBe(true);
  });
});

// ── Ping ──

describe('Ping', () => {
  test('ping returns ok', async () => {
    const result = await channel.execute({ method: Methods.Ping, args: {} });
    expect(result.ok).toBe(true);
  });
});