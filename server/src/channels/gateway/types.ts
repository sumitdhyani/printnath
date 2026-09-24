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
  [M in GwInMethods]: { method: M; ok: true; result: Contract[M]["result"] } | { method: M; ok: false; error: Contract[M]["error"] };
}[GwInMethods];

export type Out_Req = {
  [M in GwOutMethods]: { method: M; args: Contract[M]['args'] };
}[GwOutMethods];

export type In_Resp = {
  [M in GwOutMethods]: { method: M; ok: true; result: Contract[M]["result"] } | { method: M; ok: false; error: Contract[M]["error"] };
}[GwOutMethods];

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

export type HeartbeatBody = { readonly type: 'HEARTBEAT',  ts: string };
export type CapabilityInfoBody = { readonly type: 'CAPABILITY_INFO', printers: import('../../shared/contracts/protocol').PrinterInfo[] };
export type PreflightBody = { readonly type: 'PRINT_PREFLIGHT', reqId: string; documents: import('../../shared/contracts/protocol').PrintDocument[] };
export type PreflightResponseBody = { readonly type: 'PRINT_PREFLIGHT_RESPONSE', reqId: string; canFulfill: boolean; reason?: string };
export type PrintJobBody = { readonly type: 'PRINT_JOB', jobId: string; artifactUrl: string; authToken: string; documents: import('../../shared/contracts/protocol').PrintDocument[] };
export type JobAcceptedBody = { readonly type: 'JOB_ACCEPTED', jobId: string };
export type JobStatusBody = {readonly type: 'JOB_STATUS', jobId: string; status: import('../../shared/contracts/protocol').JobStatusValue; reason?: string; at: string };

export type WSMsgBody = HeartbeatBody |
    CapabilityInfoBody |
    PreflightBody |
    PreflightResponseBody |
    PrintJobBody |
    JobAcceptedBody |
    JobStatusBody; 

export type WsMessage = { payload: WSMsgBody, timestamp: string };


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