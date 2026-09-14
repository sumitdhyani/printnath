import { createMachine } from 'xstate';

/**
 * Gateway Lifecycle SM
 * Tracks gateway device state: PRE_ACTIVATION → ACTIVATED → OPERATIONAL.
 * Runs on server-side Gateway channel. Mirrored on physical gateway.
 */
export const gatewayLifecycleMachine = createMachine({
  id: 'gatewayLifecycle',
  initial: 'PRE_ACTIVATION',
  states: {
    PRE_ACTIVATION: {
      on: { activate: { target: 'ACTIVATED' } },
    },
    ACTIVATED: {
      on: {
        configurePrinters: { target: 'OPERATIONAL' },
        deactivate: { target: 'PRE_ACTIVATION' },
      },
    },
    OPERATIONAL: {
      on: { configInvalidated: { target: 'ACTIVATED' } },
    },
  },
});

/**
 * Printer State SM
 * Tracks individual printer state on a gateway.
 * Server stores last reported state. Gateway is authoritative.
 */
export const printerStateMachine = createMachine({
  id: 'printerState',
  initial: 'UNKNOWN',
  states: {
    UNKNOWN: {
      on: { discover: { target: 'IDLE' } },
    },
    IDLE: {
      on: {
        startPrint: { target: 'PRINTING' },
        jam: { target: 'JAMMED' },
        paperOut: { target: 'PAPER_OUT' },
        goOffline: { target: 'OFFLINE' },
        error: { target: 'ERROR' },
      },
    },
    PRINTING: {
      on: {
        finishPrint: { target: 'IDLE' },
        jam: { target: 'JAMMED' },
        paperOut: { target: 'PAPER_OUT' },
        goOffline: { target: 'OFFLINE' },
        error: { target: 'ERROR' },
      },
    },
    JAMMED: { on: { clear: { target: 'IDLE' } } },
    PAPER_OUT: { on: { clear: { target: 'IDLE' } } },
    OFFLINE: { on: { reconnect: { target: 'IDLE' } } },
    ERROR: { on: { clear: { target: 'IDLE' } } },
  },
});