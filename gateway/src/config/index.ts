import path from 'path';
import fs from 'fs';

export interface GatewayConfig {
  serverUrl: string;
  wsUrl: string;
  deviceId: string;
  softwareVersion: string;
  heartbeatIntervalMs: number;
  maxReconnectDelayMs: number;
  artifactMaxSizeMb: number;
  printerPollIntervalMs: number;
}

function loadJson(path: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf-8'));
  } catch {
    return {};
  }
}

const deviceId = process.env.DEVICE_ID ?? 'dev-gateway-001';

export const config: GatewayConfig = {
  serverUrl: process.env.SERVER_URL ?? 'http://localhost:3000',
  wsUrl: process.env.WS_URL ?? 'ws://localhost:3000/ws/gateway',
  deviceId,
  softwareVersion: process.env.SOFTWARE_VERSION ?? '0.1.0',
  heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS ?? '30000', 10),
  maxReconnectDelayMs: parseInt(process.env.MAX_RECONNECT_DELAY_MS ?? '60000', 10),
  artifactMaxSizeMb: parseInt(process.env.ARTIFACT_MAX_SIZE_MB ?? '100', 10),
  printerPollIntervalMs: parseInt(process.env.PRINTER_POLL_INTERVAL_MS ?? '5000', 10),
};