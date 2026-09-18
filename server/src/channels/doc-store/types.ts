// ===== Doc Store Channel types =====
// Derives In_Req / Out_Resp from the shared Contract.

import { Methods, type Contract } from '../../shared/contracts/protocol';

// Explicit method list
type DocStoreMethods =
  | typeof Methods.StoreArtifact
  | typeof Methods.GetArtifactStream
  | typeof Methods.DeleteArtifact
  | typeof Methods.ArtifactExists;

export type In_Req = {
  [M in DocStoreMethods]: { method: M; args: Contract[M]['args'] };
}[DocStoreMethods];

export type Out_Resp = {
  [M in DocStoreMethods]: { method: M; ok: true; result: Contract[M]['result'] } | { method: M; ok: false; error: Contract[M]['error'] };
}[DocStoreMethods];

export { Methods } from '../../shared/contracts/protocol';
