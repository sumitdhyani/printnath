# Data Consistency Notes (v1)

Referenced by known_issues.md for technical root cause details.

---

### §1. Payment ↔ Job state sync

**Known issue:** Payment confirmed but job not printed (known_issues.md §1)

`createPayment` does NOT auto-update `PrintJob.state` to `PAID`.
Router must call `updateJobState` separately after payment succeeds.

**Failure:** Payment created, `updateJobState` fails (crash/timeout).
- Payment exists (`status: SUCCESS`)
- Job stays `PAYMENT_PENDING`
- Recovery: manual check via audit log, retry `updateJobState`

---

### §2. Gateway state without capabilities

**Known issue:** Gateway OPERATIONAL but preflight fails (known_issues.md §2)

`updateGatewayState` to `OPERATIONAL` does NOT require capabilities to be set.
Capabilities set via separate `updateGatewayCapabilities` call.

**Failure:** Gateway state set to OPERATIONAL, capabilities never reported.
- Preflight always fails — server can't check requirements against empty capabilities
- Recovery: gateway re-sends capabilities on next heartbeat

---

### §3. Orphan sessions

**Known issue:** Session expired mid-flow (known_issues.md §3)

Expired sessions accumulate in DB. No TTL-based cleanup.

**Mitigation:** Read path checks `expiresAt` — returns null for expired sessions.
Periodic cleanup query can be added later.

---

### §4. Duplicate payment webhooks

**Known issue:** Duplicate webhook (known_issues.md §4)

Unique index on `Payment(provider, providerRef)` prevents double-charge.
Second webhook returns existing record — idempotent.

---

## Design Decisions

| Issue | v1 approach | Future improvement |
|---|---|---|
| Payment + job state (known_issues.md §1) | Two separate calls | Transactional outbox pattern |
| Expired sessions (known_issues.md §3) | Filter on read | Cron job cleanup |
| Gateway capabilities (known_issues.md §2) | Set separately | Enforce at state transition |
| Crash recovery | Manual via audit log | Saga pattern / retry queue |

## Audit Log Schema

Every state-changing operation writes to `AuditLog`:

```
entityType | entityId | event       | fromState        | toState
print_job  | JOB-001  | state_change| PAYMENT_PENDING  | PAID
payment    | PAY-001  | created     | null             | PENDING
gateway    | GW-001   | state_change| PRE_ACTIVATION   | ACTIVATED
```

Use audit log to reconstruct sequence of events during incident review.