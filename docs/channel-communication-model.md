# Channel Communication Model

Each channel communicates with the router through typed message interfaces.

## 10-Type Model

| Type | Direction | Purpose |
|---|---|---|
| **In_Req** | Router → Channel | Router asks channel to perform an action |
| **Out_Resp** | Channel → Router | Channel responds to an In_Req |
| **Out_Req** | Channel → Router | Channel asks router to perform an action |
| **In_Resp** | Router → Channel | Router responds to an Out_Req |
| **Out_Pub** | Channel → Router | Channel publishes information (no subscription required) |
| **In_Sub** | Router → Channel | Channel receives something it subscribed to |
| **Out_Sub** | Channel → Router | Channel sends data to its subscribers |
| **In_Pub** | Router → Channel | Router pushes a publication to channel |
| **Out_Us** | Channel → Router | Channel emits an unsolicited event |
| **In_Us** | Router → Channel | Channel receives an unsolicited event |

## Communication Patterns

### Request-Response (sync)

```
Router                    Channel
   │                         │
   │────── In_Req ──────────→│
   │                         │
   │←───── Out_Resp ────────│
```

Used when router needs a result before proceeding (e.g., query DB, dispatch job).

### Outgoing Request (async)

```
Router                    Channel
   │                         │
   │←───── Out_Req ─────────│
   │                         │
   │────── In_Resp ─────────→│
```

Used when channel needs router to do something and wants confirmation.

### Publication (one-to-many)

```
Channel A          Router          Channel B
   │                   │               │
   │── Out_Pub ───────→│               │
   │                   │── In_Sub ────→│
```

Used when a channel broadcasts information that others may have subscribed to.

### Subscription

```
Channel B          Router          Channel A
   │                   │               │
   │── Out_Sub ───────→│               │
   │                   │── In_Pub ────→│
```

Used when a channel receives data it explicitly subscribed for.

### Unsolicited Event

```
Router                    Channel
   │                         │
   │←───── Out_Us ──────────│
```

Used when channel needs to notify router of something unexpected (e.g., gateway disconnected, error).

## Per-Channel Usage

| Channel | Types used |
|---|---|
| Data DB | In_Req, Out_Resp |
| Gateway | In_Req, Out_Resp, Out_Req, Out_Us |
| User (future) | In_Req, Out_Resp, Out_Req, In_Resp |
| Doc Store (future) | In_Req, Out_Resp |
## Shared Contract

All channel methods and their arg/result/error shapes are defined in a single shared contract:

```
server/src/shared/contracts/protocol.ts
```

The file exports a `Methods` const (all method names) and a `Contract` interface (per-method shapes). Each channel's `types.ts` imports these, picks its method subset, and derives its `In_Req`, `Out_Resp`, etc. using mapped types:

```ts
import { Methods, type Contract } from '../../shared/contracts/protocol';

type MyMethods = | typeof Methods.SomeAction | typeof Methods.AnotherAction;

export type In_Req = {
  [M in MyMethods]: { method: M; args: Contract[M]['args'] };
}[MyMethods];

export type Out_Resp = {
  [M in MyMethods]: { method: M; ok: true; data: Contract[M]['result'] };
}[MyMethods] | { method: string; ok: false; error: string };
```

This ensures method names never drift between channels, and the Router can rely on a single `Contract` type for cross-channel routing.
