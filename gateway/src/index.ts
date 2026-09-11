import { config } from './config';

async function main() {
  console.log('PrintNath Gateway starting...');
  console.log('Server URL:', config.serverUrl);
  console.log('Device ID:', config.deviceId);

  // TODO Phase 1: HTTP HELLO → WebSocket connect → heartbeat loop

  console.log('Gateway running. Connecting to server...');
}

main().catch(console.error);