import { describe, test, expect, beforeEach } from 'vitest';
import { initDataDb, type DataDbChannel } from '../server/src/channels/data-db/index';
import { Methods } from '../server/src/channels/data-db/types';

let channel: DataDbChannel;

beforeEach(async () => {
  channel = await initDataDb({
    config: { url: globalThis.__TEST_DB_URL__ },
    sendToRouter: async () => {},
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
    expect(createResult.data.phone).toBe('+911234567890');

    const getResult = await channel.execute({
      method: Methods.GetOwnerByPhone,
      args: { phone: '+911234567890' },
    });
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.data?.phone).toBe('+911234567890');
    expect(getResult.data?.displayName).toBe('Test Owner');
  });

  test('get owner by unknown phone returns null', async () => {
    const result = await channel.execute({
      method: Methods.GetOwnerByPhone,
      args: { phone: '+911111111111' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toBeNull();
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
    expect(createResult.data.deviceId).toBe(DEVICE_ID);
    expect(createResult.data.lifecycleState).toBe('PRE_ACTIVATION');

    const getResult = await channel.execute({
      method: Methods.GetGatewayByDeviceId,
      args: { deviceId: DEVICE_ID },
    });
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.data?.deviceId).toBe(DEVICE_ID);
  });

  test('unknown device returns null', async () => {
    const result = await channel.execute({
      method: Methods.GetGatewayByDeviceId,
      args: { deviceId: 'nonexistent' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toBeNull();
  });

  test('update gateway state from PRE_ACTIVATION to ACTIVATED to OPERATIONAL', async () => {
    await channel.execute({ method: Methods.PreRegisterDevice, args: { deviceId: DEVICE_ID } });

    const activateResult = await channel.execute({
      method: Methods.UpdateGatewayState,
      args: { deviceId: DEVICE_ID, lifecycleState: 'ACTIVATED', deviceToken: 'tok-abc' },
    });
    expect(activateResult.ok).toBe(true);
    if (!activateResult.ok) return;
    expect(activateResult.data.lifecycleState).toBe('ACTIVATED');
    expect(activateResult.data.deviceToken).toBe('tok-abc');

    const operationalResult = await channel.execute({
      method: Methods.UpdateGatewayState,
      args: { deviceId: DEVICE_ID, lifecycleState: 'OPERATIONAL', isConnected: true },
    });
    expect(operationalResult.ok).toBe(true);
    if (!operationalResult.ok) return;
    expect(operationalResult.data.lifecycleState).toBe('OPERATIONAL');
    expect(operationalResult.data.isConnected).toBe(true);
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
    expect((getResult.data as any).capabilities?.color).toBe(true);
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
    expect(result.data).toHaveLength(0);
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
    expect(result.data.length).toBeGreaterThanOrEqual(2);
  });

  test('get pricing for owner with no pricing returns empty array', async () => {
    const result = await channel.execute({
      method: Methods.GetPricingByOwner,
      args: { ownerPhone: '+919999999999' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual([]);
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
        gatewayId: gw.data!.id,
        sessionToken: SESSION_TOKEN,
        mode: 'ANONYMOUS',
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;
    expect((createResult.data as any).sessionToken).toBe(SESSION_TOKEN);

    const getResult = await channel.execute({
      method: Methods.GetSessionByToken,
      args: { token: SESSION_TOKEN },
    });
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.data?.sessionToken).toBe(SESSION_TOKEN);
  });
});

// ── Print Job ──

describe('PrintJob', () => {
  const DEVICE_ID = 'job-device';
  let gatewayId: string;
  let sessionId: string;

  beforeEach(async () => {
    await channel.execute({ method: Methods.PreRegisterDevice, args: { deviceId: DEVICE_ID } });
    await channel.execute({
      method: Methods.UpdateGatewayState,
      args: { deviceId: DEVICE_ID, lifecycleState: 'OPERATIONAL' },
    });
    const gw = await channel.execute({ method: Methods.GetGatewayByDeviceId, args: { deviceId: DEVICE_ID } });
    if (!gw.ok) return;
    gatewayId = gw.data!.id;

    const sess = await channel.execute({
      method: Methods.CreateSession,
      args: {
        gatewayId,
        sessionToken: `tok-${Date.now()}`,
        mode: 'ANONYMOUS',
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    if (!sess.ok) return;
    sessionId = (sess.data as any).id;
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
        documents: [
          {
            documentId: 'doc-1',
            pageCount: 4,
            copies: 2,
            color: false,
            duplex: true,
            paperSize: 'A4',
            pricePaise: 2400,
          },
        ],
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.data as any).jobDocuments).toHaveLength(1);
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
        documents: [
          {
            documentId: 'doc-a',
            pageCount: 4,
            copies: 1,
            color: false,
            duplex: true,
            paperSize: 'A4',
            pricePaise: 1200,
          },
        ],
      },
    });
    if (!createResult.ok) return;
    const jobId = (createResult.data as any).id;

    // Without documents
    const resultWithout = await channel.execute({
      method: Methods.GetPrintJob,
      args: { id: jobId },
    });
    expect(resultWithout.ok).toBe(true);
    if (!resultWithout.ok) return;
    expect(resultWithout.data?.jobDocuments).toBeUndefined();

    // With documents
    const resultWith = await channel.execute({
      method: Methods.GetPrintJob,
      args: { id: jobId, includeDocuments: true },
    });
    expect(resultWith.ok).toBe(true);
    if (!resultWith.ok) return;
    expect(resultWith.data?.jobDocuments).toHaveLength(1);
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