// ===== HTTP HELLO message =====

export interface HelloRequest {
  deviceId: string;
  softwareVersion: string;
}

export type HelloResponseState =
  | 'PRE_ACTIVATION'
  | 'ACTIVATED'
  | 'OPERATIONAL';

export interface HelloResponse {
  state: HelloResponseState;
  shopId?: string;
  retryAfter?: number;  // seconds, only for PRE_ACTIVATION
  pendingJobIds?: string[];
}

// ===== WebSocket message types =====

export type WsMessageType =
  // Gateway → Server
  | 'HEARTBEAT'
  | 'CAPABILITY_RESPONSE'
  | 'PRINT_PREFLIGHT_RESPONSE'
  | 'JOB_ACCEPTED'
  | 'JOB_STATUS'
  | 'PRINTER_STATE'
  // Server → Gateway
  | 'CAPABILITY_QUERY'
  | 'PRINT_PREFLIGHT'
  | 'PRINT_JOB';

// ===== Base WS message envelope =====

export interface WsMessage<T = unknown> {
  type: WsMessageType;
  payload: T;
  timestamp: string;  // ISO 8601
}

// ===== Gateway → Server messages =====

export interface HeartbeatPayload {
  ts: string;
}

export interface PrinterInfo {
  name: string;
  state: PrinterStateString;
  capabilities: Record<string, unknown>;
}

export type PrinterStateString = string; // maps to PrinterState enum

export interface CapabilityResponsePayload {
  printers: PrinterInfo[];
}

export interface PreflightResponsePayload {
  jobId: string;
  canFulfill: boolean;
  reason?: string;
}

export interface JobAcceptedPayload {
  jobId: string;
}

export type JobStatusValue =
  | 'QUEUED' | 'PRINTING' | 'COMPLETED' | 'FAILED';

export interface JobStatusPayload {
  jobId: string;
  status: JobStatusValue;
  reason?: string;
  at: string;  // ISO 8601
}

export interface PrinterStatePayload {
  printerId: string;
  state: PrinterStateString;
  at: string;
}

// ===== Server → Gateway messages =====

export interface PreflightPayload {
  jobId: string;
  requirements: PrintRequirementsPayload;
}

export interface PrintRequirementsPayload {
  pageCount: number;
  color: boolean;
  duplex: boolean;
  copies: number;
  paperSize?: string;
}

export interface PrintJobPayload {
  jobId: string;
  artifactUrl: string;
  authToken: string;
  requirements: PrintRequirementsPayload;
}

// ===== Session events (browser → server) =====

export type BrowserEventType =
  | 'page_loaded'
  | 'phone_submitted'
  | 'otp_submitted'
  | 'documents_selected'
  | 'document_uploaded'
  | 'options_configured'
  | 'pay_clicked'
  | 'payment_done';

export interface BrowserEvent {
  type: BrowserEventType;
  sessionToken: string;
  payload?: unknown;
}

// ===== Server events (validated signals) =====

export type ServerEventType =
  | 'session_created'
  | 'otp_requested'
  | 'otp_verified'
  | 'otp_failed'
  | 'documents_attached'
  | 'job_created'
  | 'preflight_passed'
  | 'preflight_failed'
  | 'payment_confirmed'
  | 'payment_failed'
  | 'print_done'
  | 'print_failed';