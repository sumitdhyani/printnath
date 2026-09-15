import { createMachine } from 'xstate';

/**
 * Server-side Gateway Lifecycle SM.
 * Tracks what the server knows about the gateway device.
 *
 * PRE_ACTIVATION — device registered in DB, not yet activated by owner
 * ACTIVATED     — owner authenticated and bound device to their account
 * OPERATIONAL   — ACTIVATED + WebSocket connected + printers ready → can accept jobs
 * OFFLINE       — WAS OPERATIONAL, WebSocket dropped. Timed reset after timeout
 *                transitions back to PRE_ACTIVATION (owner must reactivate)
 *
 * Transitions:
 *   PRE_ACTIVATION → ACTIVATED        (owner scans QR, authenticates, activates)
 *   ACTIVATED      → OPERATIONAL      (WS established, capabilities reported)
 *   OPERATIONAL    → OFFLINE          (WS disconnected)
 *   OFFLINE        → OPERATIONAL      (WS reconnected within timeout window)
 *   OFFLINE        → PRE_ACTIVATION   (timeout expired — stale device)
 *   OPERATIONAL    → ACTIVATED        (config invalidated, needs re-setup)
 *   ACTIVATED      → PRE_ACTIVATION   (owner deactivates / admin reset)
 */
export const gatewayServerMachine = createMachine({
  id: 'gatewayServer',
  initial: 'PRE_ACTIVATION',
  states: {
    PRE_ACTIVATION: {
      on: { activate: { target: 'ACTIVATED' } },
    },
    ACTIVATED: {
      on: {
        goOperational: { target: 'OPERATIONAL' },
        deactivate: { target: 'PRE_ACTIVATION' },
      },
    },
    OPERATIONAL: {
      on: {
        goOffline: { target: 'OFFLINE' },
        configInvalidated: { target: 'ACTIVATED' },
      },
    },
    OFFLINE: {
      on: {
        reconnect: { target: 'OPERATIONAL' },
        timeoutReset: { target: 'PRE_ACTIVATION' },
      },
    },
  },
});