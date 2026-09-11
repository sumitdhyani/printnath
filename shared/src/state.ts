import type { SessionMode } from './types';

// ===== Browser User Session SM states =====

export type BrowserSessionState =
  | 'LANDING'
  | 'DOCUMENT_UPLOAD'
  | 'DOCUMENT_SELECTION'
  | 'CONFIGURATION'
  | 'PHONE_INPUT'
  | 'OTP_INPUT'
  | 'AUTHENTICATED'
  | 'PREFLIGHT_WAITING'
  | 'PAYMENT'
  | 'PRINT_STATUS'
  | 'COMPLETED'
  | 'FAILED';

// ===== Browser SM events =====

export type BrowserSessionEvent =
  | { type: 'seePendingDocs' }
  | { type: 'uploadNewDoc' }
  | { type: 'enterPhone' }
  | { type: 'requestOtp' }
  | { type: 'otpVerified' }
  | { type: 'otpInvalid' }
  | { type: 'loadDocuments' }
  | { type: 'uploadComplete' }
  | { type: 'selectAndConfigure' }
  | { type: 'payAndPrint' }
  | { type: 'preflightPassed' }
  | { type: 'preflightFailed' }
  | { type: 'paymentInitiated' }
  | { type: 'printDone' }
  | { type: 'printFailed' };

// ===== Browser SM context =====

export interface BrowserSessionContext {
  mode: SessionMode;
  sessionToken: string;
  errorMessage?: string;
}

// ===== Server User Session SM states =====

export type ServerSessionState =
  | 'AWAITING_AUTH'
  | 'AUTHENTICATED'
  | 'AWAITING_DOCS'
  | 'DOCUMENTS_ATTACHED'
  | 'PREFLIGHT_PENDING'
  | 'AWAITING_PAYMENT'
  | 'PRINTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REJECTED';

// ===== Server SM events =====

export type ServerSessionEvent =
  | { type: 'otpVerified' }
  | { type: 'skipAuth' }
  | { type: 'sessionLinkedToDocs' }
  | { type: 'documentsAttached' }
  | { type: 'jobCreated' }
  | { type: 'preflightPassed' }
  | { type: 'preflightFailed' }
  | { type: 'paymentConfirmed' }
  | { type: 'printDone' }
  | { type: 'printFailed' };

// ===== Print Job SM states =====

export type PrintJobState =
  | 'CREATED'
  | 'PREFLIGHT_PENDING'
  | 'REJECTED'
  | 'PAYMENT_PENDING'
  | 'CANCELLED'
  | 'PAID'
  | 'AUTHORIZED'
  | 'DISPATCHED'
  | 'ACCEPTED'
  | 'QUEUED'
  | 'PRINTING'
  | 'COMPLETED'
  | 'FAILED';

// ===== Print Job SM events =====

export type PrintJobEvent =
  | { type: 'sendPreflight' }
  | { type: 'preflightOk' }
  | { type: 'preflightReject' }
  | { type: 'paymentInitiated' }
  | { type: 'paymentConfirmed' }
  | { type: 'authorizePrint' }
  | { type: 'dispatchJob' }
  | { type: 'jobAccepted' }
  | { type: 'jobQueued' }
  | { type: 'printing' }
  | { type: 'completed' }
  | { type: 'failed' }
  | { type: 'cancelled' };

// ===== Gateway Lifecycle SM states =====

export type GatewayLifecycleEvent =
  | { type: 'activate' }
  | { type: 'configurePrinters' }
  | { type: 'configInvalidated' }
  | { type: 'deactivate' };

// ===== Printer State SM events =====

export type PrinterStateEvent =
  | { type: 'discover' }
  | { type: 'startPrint' }
  | { type: 'finishPrint' }
  | { type: 'jam' }
  | { type: 'paperOut' }
  | { type: 'goOffline' }
  | { type: 'error' }
  | { type: 'clear' }
  | { type: 'reconnect' };