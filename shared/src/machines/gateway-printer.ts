import { createMachine } from 'xstate';

/**
 * Gateway Lifecycle SM
 * Runs on gateway, mirrored on server.
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
 * Runs on gateway, reported to server.
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