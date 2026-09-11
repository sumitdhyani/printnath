import { createMachine } from 'xstate';

/**
 * Print Job SM
 * Server-authoritative execution lifecycle.
 */
export const printJobMachine = createMachine({
  id: 'printJob',
  initial: 'CREATED',
  context: {},
  states: {
    CREATED: {
      on: {
        sendPreflight: { target: 'PREFLIGHT_PENDING' },
      },
    },
    PREFLIGHT_PENDING: {
      on: {
        preflightOk: { target: 'PAYMENT_PENDING' },
        preflightReject: { target: 'REJECTED' },
      },
    },
    PAYMENT_PENDING: {
      on: {
        paymentConfirmed: { target: 'PAID' },
        cancelled: { target: 'CANCELLED' },
      },
    },
    PAID: {
      on: {
        authorizePrint: { target: 'AUTHORIZED' },
      },
    },
    AUTHORIZED: {
      on: {
        dispatchJob: { target: 'DISPATCHED' },
      },
    },
    DISPATCHED: {
      on: {
        jobAccepted: { target: 'ACCEPTED' },
      },
    },
    ACCEPTED: {
      on: {
        jobQueued: { target: 'QUEUED' },
        printing: { target: 'PRINTING' },
      },
    },
    QUEUED: {
      on: {
        printing: { target: 'PRINTING' },
      },
    },
    PRINTING: {
      on: {
        completed: { target: 'COMPLETED' },
        failed: { target: 'FAILED' },
      },
    },
    COMPLETED: { type: 'final' },
    FAILED: { type: 'final' },
    REJECTED: { type: 'final' },
    CANCELLED: { type: 'final' },
  },
});