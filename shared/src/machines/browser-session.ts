import { createMachine } from 'xstate';
import type {
  BrowserSessionState,
  BrowserSessionEvent,
} from '../state';

/**
 * Browser User Session SM
 * Single machine with mode branching (ANONYMOUS vs OTP_AUTHENTICATED).
 * Guards check mode to determine entry path.
 */
export const browserSessionMachine = createMachine({
  id: 'browserSession',
  initial: 'LANDING',
  context: {
    mode: 'ANONYMOUS' as const,
    sessionToken: '',
    errorMessage: undefined as string | undefined,
  },
  states: {
    LANDING: {
      on: {
        seePendingDocs: { target: 'DOCUMENT_SELECTION' },
        uploadNewDoc: { target: 'DOCUMENT_UPLOAD' },
        enterPhone: {
          target: 'PHONE_INPUT',
          guard: ({ context }) => context.mode === 'OTP_AUTHENTICATED',
        },
      },
    },
    DOCUMENT_UPLOAD: {
      on: {
        uploadComplete: { target: 'DOCUMENT_SELECTION' },
      },
    },
    PHONE_INPUT: {
      on: {
        requestOtp: { target: 'OTP_INPUT' },
      },
    },
    OTP_INPUT: {
      on: {
        otpVerified: { target: 'AUTHENTICATED' },
        otpInvalid: { target: 'OTP_INPUT' },
      },
    },
    AUTHENTICATED: {
      on: {
        loadDocuments: { target: 'DOCUMENT_SELECTION' },
      },
    },
    DOCUMENT_SELECTION: {
      on: {
        selectAndConfigure: { target: 'CONFIGURATION' },
      },
    },
    CONFIGURATION: {
      on: {
        payAndPrint: { target: 'PREFLIGHT_WAITING' },
      },
    },
    PREFLIGHT_WAITING: {
      on: {
        preflightPassed: { target: 'PAYMENT' },
        preflightFailed: { target: 'FAILED' },
      },
    },
    PAYMENT: {
      on: {
        paymentInitiated: { target: 'PRINT_STATUS' },
      },
    },
    PRINT_STATUS: {
      on: {
        printDone: { target: 'COMPLETED' },
        printFailed: { target: 'FAILED' },
      },
    },
    COMPLETED: { type: 'final' },
    FAILED: { type: 'final' },
  },
});