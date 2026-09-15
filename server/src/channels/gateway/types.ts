// ===== Gateway Channel type contracts =====

// ── Method constants ──

export const Methods = {
// In_Req
  RequestPreFlight: 'requestPreFlight',
  RequestPrint: 'requestPrint',
  GetPrinterCapabilities : 'getPrinterCapabilities',
  // Out_Req
  RequestDeviceDetails  : 'requestDeviceDetails',
  ValidateArtifactToken : 'validateArtifactToken'
} as const;

// ── Incoming requests (Router → Gateway channel) ──

export type In_Req =
  | { method: typeof Methods.RequestPreFlight; args: { deviceId: string; jobId: string; documents: PrintDocument[] } }
  | { method: typeof Methods.RequestPrint; args: { deviceId: string; jobId: string; artifactUrl: string; authToken: string; documents: PrintDocument[] } }
  | { method: typeof Methods.GetPrinterCapabilities; args: { deviceId: string } };

// ── Outgoing responses (in reply to In_Req) ──

export type Out_Resp =
  | { method: typeof Methods.RequestPreFlight; ok: true}
  | { method: typeof Methods.RequestPrint; ok: true}
  | { method: typeof Methods.GetPrinterCapabilities; ok: true; data: { printers: PrinterInfo[] } }
  | { method: string; ok: false; error: string };

  export type Out_Req =
  | { method: typeof Methods.RequestDeviceDetails; args: { deviceId: string } }
  | { method: typeof Methods.ValidateArtifactToken; args: { jobId: string; authToken: string } };

  export type In_Resp =
  | {method: typeof Methods.RequestDeviceDetails, ok: true, data: {deviceId : string, lifecycleState: string, deviceToken: string | null} }
  | {method: typeof Methods.ValidateArtifactToken, ok: true, data: {valid: boolean} }
  | {method: string; ok: false; error: string };

export type Out_Us =
  | { event: 'GW_CHANNEL_READY'; payload: { wsPort: number } }
  | { event: 'GW_CONNECTED'; payload: { deviceId: string } }
  | { event: 'GW_DISCONNECTED'; payload: { deviceId: string } }
  | { event: 'GW_ERROR'; payload: { deviceId: string; error: string } }
  | { event: 'JOB_STATUS_UPDATE'; payload: { deviceId: string; jobId: string; status: JobStatusValue; reason?: string } };

// ── Incoming responses (Router → Gateway channel, in reply to Out_Req) ──

// ===== Wire protocol: Gateway ↔ Server =====

// ── HELLO HTTP ──

export type HelloRequest = {
  deviceId: string;
  softwareVersion: string;
}

export type HelloState = 'PRE_ACTIVATION' | 'ACTIVATED' | 'OPERATIONAL';

export type HelloResponse = {
  state: HelloState;
  deviceToken?: string;
  shopName?: string;
  pendingJobIds?: string[];
  retryAfter?: number;
}

// ── WebSocket message types ──

export type WsMessageType =
  // From server channel
  | 'HEARTBEAT'
  | 'CAPABILITY_QUERY'
  | 'PRINT_PREFLIGHT'
  | 'PRINT_JOB'
  // From gwteway device
  | 'CAPABILITY_RESPONSE'
  | 'PRINT_PREFLIGHT_RESPONSE'
  | 'JOB_ACCEPTED'
  | 'JOB_STATUS';

// ── WebSocket message envelope ──

export type WsMessage<T = unknown> = {
  type: WsMessageType;
  payload: T;
  timestamp: string;
}

// ── WebSocket message payloads ──

export type HeartbeatPayload = {
  ts: string;
}

export type PrinterInfo = {
  name: string;
  state: string;
  capabilities: {
    color: boolean;
    duplex: boolean;
    sizes: string[];
    maxCopies?: number;
  };
}

export type CapabilityResponsePayload = {
  printers: PrinterInfo[];
}

export type PrintDocument = {
  pageCount: number;
  color: boolean;
  duplex: boolean;
  paperSize: string;
  copies: number;
}

export type PreflightPayload = {
  jobId: string;
  documents: PrintDocument[];
}

export type PreflightResponsePayload = {
  jobId: string;
  canFulfill: boolean;
  reason?: string;
}

export type PrintJobPayload = {
  jobId: string;
  artifactUrl: string;
  authToken: string;
  documents: PrintDocument[];
}

export type JobAcceptedPayload = {
  jobId: string;
}

export type JobStatusValue = 'QUEUED' | 'PRINTING' | 'COMPLETED' | 'FAILED';

export type JobStatusPayload = {
  jobId: string;
  status: JobStatusValue;
  reason?: string;
  at: string;
}

