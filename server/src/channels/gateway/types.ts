// ===== Gateway Channel types =====
// Derives In_Req / Out_Resp / Out_Req / In_Resp from the shared Contract.

export type { PrinterInfo } from "../../shared/contracts/protocol";
export { Methods, type Contract } from "../../shared/contracts/protocol";
import { Methods, type Contract } from '../../shared/contracts/protocol';

// ── Gateway method subsets ──

type GwInMethods =
  | typeof Methods.RequestPreFlight
  | typeof Methods.RequestPrint
  | typeof Methods.GetPrinterCapabilities;

type GwOutMethods =
  | typeof Methods.RequestDeviceDetails
  | typeof Methods.ValidateArtifactToken
  | typeof Methods.FetchArtifact;

// ── Derived types ──

export type In_Req = {
  [M in GwInMethods]: { method: M; args: Contract[M]['args'] };
}[GwInMethods];

export type Out_Resp = {
  [M in GwInMethods]: { method: M; ok: true; result: Contract[M]["result"] };
}[GwInMethods] | { method: string; ok: false; error: { reason: string } };

export type Out_Req = {
  [M in GwOutMethods]: { method: M; args: Contract[M]['args'] };
}[GwOutMethods];

export type In_Resp = {
  [M in GwOutMethods]: { method: M; ok: true; result: Contract[M]["result"] };
}[GwOutMethods] | { method: string; ok: false; error: { reason: string } };

// ── Out_Us: events (fire-and-forget, no response) ──

export type Out_Us =
  | { event: 'GW_CHANNEL_READY'; payload: { wsPort: number } }
  | { event: 'GW_CONNECTED'; payload: { deviceId: string } }
  | { event: 'GW_DISCONNECTED'; payload: { deviceId: string } }
  | { event: 'GW_ERROR'; payload: { deviceId: string; error: string } }
  | { event: 'JOB_STATUS_UPDATE'; payload: { deviceId: string; jobId: string; status: import('../../shared/contracts/protocol').JobStatusValue; reason?: string } };

// ══════════════════════════════════════════════════════════════
// Wire protocol types (Gateway ↔ Server WebSocket messages)
// These define the on-the-wire format between server and gateway device.
// ══════════════════════════════════════════════════════════════

export type WsMessageType =
  | 'HEARTBEAT'
  | 'PRINT_PREFLIGHT'
  | 'PRINT_JOB'
  | 'CAPABILITY_INFO'
  | 'PRINT_PREFLIGHT_RESPONSE'
  | 'JOB_ACCEPTED'
  | 'JOB_STATUS';

export type WsMessage<T = unknown> = { type: WsMessageType; payload: T; timestamp: string };

export type HeartbeatPayload = { ts: string };
export type CapabilityInfoPayload = { printers: import('../../shared/contracts/protocol').PrinterInfo[] };
export type PreflightPayload = { jobId: string; documents: import('../../shared/contracts/protocol').PrintDocument[] };
export type PreflightResponsePayload = { jobId: string; canFulfill: boolean; reason?: string };
export type PrintJobPayload = { jobId: string; artifactUrl: string; authToken: string; documents: import('../../shared/contracts/protocol').PrintDocument[] };
export type JobAcceptedPayload = { jobId: string };
export type JobStatusPayload = { jobId: string; status: import('../../shared/contracts/protocol').JobStatusValue; reason?: string; at: string };

// HTTP HELLO
export type HelloRequest = { deviceId: string; softwareVersion: string };
export type HelloState = 'PRE_ACTIVATION' | 'ACTIVATED' | 'OPERATIONAL';
export type HelloResponse = {
  state: HelloState;
  deviceToken?: string;
  shopName?: string;
  pendingJobIds?: string[];
  retryAfter?: number;
};