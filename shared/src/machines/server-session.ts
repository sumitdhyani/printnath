import { createMachine } from 'xstate';

/**
 * Server User Session SM
 * Authoritative business-logic machine. Events from validated signals.
 * Mode branching: ANONYMOUS skips auth, OTP must verify.
 */
export const serverSessionMachine = createMachine({
  id: 'serverSession',
  initial: 'AWAITING_AUTH',
  context: { mode: 'ANONYMOUS' },
  states: {
    AWAITING_AUTH: {
      on: {
        otpVerified: { target: 'AUTHENTICATED' },
        skipAuth: { target: 'AWAITING_DOCS' },
      },
    },
    AUTHENTICATED: {
      on: {
        sessionLinkedToDocs: { target: 'AWAITING_DOCS' },
      },
    },
    AWAITING_DOCS: {
      on: {
        documentsAttached: { target: 'DOCUMENTS_ATTACHED' },
      },
    },
    DOCUMENTS_ATTACHED: {
      on: {
        jobCreated: { target: 'PREFLIGHT_PENDING' },
      },
    },
    PREFLIGHT_PENDING: {
      on: {
        preflightPassed: { target: 'AWAITING_PAYMENT' },
        preflightFailed: { target: 'REJECTED' },
      },
    },
    AWAITING_PAYMENT: {
      on: {
        paymentConfirmed: { target: 'PRINTING' },
      },
    },
    PRINTING: {
      on: {
        printDone: { target: 'COMPLETED' },
        printFailed: { target: 'FAILED' },
      },
    },
    COMPLETED: { type: 'final' },
    FAILED: { type: 'final' },
    REJECTED: { type: 'final' },
  },
});