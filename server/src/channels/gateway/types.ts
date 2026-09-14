// ===== Gateway Channel type contracts =====

// ── Method constants ──

export const Methods = {
  DispatchPrintJob: 'dispatchPrintJob',
  DispatchPreflight: 'dispatchPreflight',
  CancelJob: 'cancelJob',
  GetConnectionStatus: 'getConnectionStatus',
  Ping: 'ping',
  Stop: 'stop',
} as const;

// ── Incoming requests (Router → Gateway channel) ──

export type In_Req =
  | { method: typeof Methods.DispatchPrintJob; args: { deviceId: string; jobId: string; artifactUrl: string; authToken: string; documents: PrintDocument[] } }
  | { method: typeof Methods.DispatchPreflight; args: { deviceId: string; jobId: string; documents: PrintDocument[] } }
  | { method: typeof Methods.CancelJob; args: { deviceId: string; jobId: string; reason: string } }
  | { method: typeof Methods.GetConnectionStatus; args: { deviceId: string } }
  | { method: typeof Methods.Ping; args: {} }
  | { method: typeof Methods.Stop; args: {} };

// ── Outgoing requests (Gateway channel → Router) ──

export type Out_Req =
  | { method: 'gatewayHello'; args: { deviceId: string; softwareVersion: string; remoteAddr: string } }
  | { method: 'jobStatusUpdate'; args: { deviceId: string; jobId: string; status: JobStatusValue; reason?: string } }
  | { method: 'capabilityReport'; args: { deviceId: string; printers: PrinterInfo[] } }
  | { method: 'preflightResponse'; args: { deviceId: string; jobId: string; canFulfill: boolean; reason?: string } }
  | { method: 'jobAccepted'; args: { deviceId: string; jobId: string } };

// ── Publications (Gateway channel → Router) ──

export type Out_Us =
  | { event: 'GW_CHANNEL_READY'; payload: { wsPort: number } }
  | { event: 'GW_CONNECTED'; payload: { deviceId: string } }
  | { event: 'GW_DISCONNECTED'; payload: { deviceId: string } }
  | { event: 'GW_ERROR'; payload: { deviceId: string; error: string } };

// ── Outgoing responses (in reply to In_Req) ──

export type Out_Resp =
  | { method: typeof Methods.DispatchPrintJob; ok: true; data: { sent: boolean } }
  | { method: typeof Methods.DispatchPreflight; ok: true; data: { sent: boolean } }
  | { method: typeof Methods.CancelJob; ok: true; data: { sent: boolean } }
  | { method: typeof Methods.GetConnectionStatus; ok: true; data: { connected: boolean; lastHeartbeat: string | null } }
  | { method: typeof Methods.Ping; ok: true; data: null }
  | { method: typeof Methods.Stop; ok: true; data: null }
  | { method: string; ok: false; error: string };

// ===== Wire protocol: Gateway ↔ Server =====

// ── HELLO HTTP ──

export interface HelloRequest {
  deviceId: string;
  softwareVersion: string;
}

export type HelloState = 'PRE_ACTIVATION' | 'ACTIVATED' | 'OPERATIONAL';

export interface HelloResponse {
  state: HelloState;
  deviceToken?: string;
  shopName?: string;
  pendingJobIds?: string[];
  retryAfter?: number;
}

// ── WebSocket message types ──

export type WsMessageType =
  | 'HEARTBEAT'
  | 'CAPABILITY_QUERY'
  | 'CAPABILITY_RESPONSE'
  | 'PRINT_PREFLIGHT'
  | 'PRINT_PREFLIGHT_RESPONSE'
  | 'PRINT_JOB'
  | 'JOB_ACCEPTED'
  | 'JOB_STATUS'
  | 'CANCEL_JOB';

// ── WebSocket message envelope ──

export interface WsMessage<T = unknown> {
  type: WsMessageType;
  payload: T;
  timestamp: string;
}

// ── WebSocket message payloads ──

export interface HeartbeatPayload {
  ts: string;
}

export interface PrinterInfo {
  name: string;
  state: string;
  capabilities: {
    color: boolean;
    duplex: boolean;
    sizes: string[];
    maxCopies?: number;
  };
}

export interface CapabilityResponsePayload {
  printers: PrinterInfo[];
}

export interface PrintDocument {
  pageCount: number;
  color: boolean;
  duplex: boolean;
  paperSize: string;
  copies: number;
}

export interface PreflightPayload {
  jobId: string;
  documents: PrintDocument[];
}

export interface PreflightResponsePayload {
  jobId: string;
  canFulfill: boolean;
  reason?: string;
}

export interface PrintJobPayload {
  jobId: string;
  artifactUrl: string;
  authToken: string;
  documents: PrintDocument[];
}

export interface JobAcceptedPayload {
  jobId: string;
}

export type JobStatusValue = 'QUEUED' | 'PRINTING' | 'COMPLETED' | 'FAILED';

export interface JobStatusPayload {
  jobId: string;
  status: JobStatusValue;
  reason?: string;
  at: string;
}

export interface CancelJobPayload {
  jobId: string;
  reason: string;
}