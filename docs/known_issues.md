# Known Issues (v1)

## 0. Gateway OFFLINE timeout not implemented

**Impact:** A gateway that goes OFFLINE stays in OFFLINE state forever unless it reconnects. No automated cleanup for decommissioned/hardware-dead gateways. Owner must manually deactivate.

**Root cause:** Server-side lifecycle SM has `OFFLINE → timeoutReset → PRE_ACTIVATION` transition but the timeout mechanism is not implemented in v1. Gateway records in OFFLINE state accumulate indefinitely.

**Data consistency:** Yes — see data_consistency_notes.md §3 (orphan sessions — same pattern applies to gateway records).

**Future fix:** Implement a cron job or lazy timeout check: if `lastHeartbeat + 30 days < now`, auto-transition to PRE_ACTIVATION.

## 1. Payment confirmed but job never prints

**Impact:** Customer pays (UPI deducted). Job stays in `PAYMENT_PENDING` state. Print never starts. Customer leaves without document.

**Root cause:** Server crash or timeout between `createPayment` and `updateJobState` calls. Payment recorded, job state not updated to `PAID`.

**Customer experience:** Money deducted, no print, no notification. Customer must contact shopkeeper to check status.

**Data consistency:** Yes — see data_consistency_notes.md §1.

---

## 2. Gateway shows operational but preflight always fails

**Impact:** Customer configures document, clicks Pay & Print. System shows "printing not available" error. Customer cannot print at this gateway.

**Root cause:** Gateway state set to `OPERATIONAL` before capabilities were reported. Server has no capability data to check preflight requirements.

**Customer experience:** Repeated failure. May try another shop or leave.

**Data consistency:** Yes — see data_consistency_notes.md §2.

---

## 3. Session expired mid-flow

**Impact:** Customer enters phone, receives OTP, but takes too long to enter it. Session expires. OTP verification fails.

**Root cause:** Session TTL (default 30 min) exceeded. Expired sessions not cleaned up — accumulate in DB.

**Customer experience:** Must scan QR again, start over. Frustrating but no data loss.

**Data consistency:** No. Read path handles expiry (`getSessionByToken` returns null for expired). Accumulation is storage waste only.

---

## 4. Duplicate payment webhook

**Impact:** Payment provider sends webhook twice. Customer charged once (UPI handles dedup), but server receives two notifications.

**Root cause:** Unique index on `Payment(provider, providerRef)` prevents second insert. Second webhook returns existing record — idempotent.

**Customer experience:** No impact. Single charge.

**Data consistency:** Handled. See data_consistency_notes.md §5.

---

## 5. Gateway goes offline mid-print

**Impact:** Customer paid, print started, gateway loses network. Job stuck in `PRINTING` state.

**Root cause:** No heartbeat from gateway. Server doesn't auto-transition stuck jobs.

**Customer experience:** Print may or may not complete. If printer finished before disconnect, document printed but system shows stuck. Customer may be asked to wait unnecessarily.

**Data consistency:** No. Job state is honest — printing was in progress when connection lost. Recovery on reconnect — see print_gateway_protocol_state_machines_and_sequences.md §3.6.

---

## 6. Pricing changed between estimate and payment

**Impact:** Customer sees ₹30 estimate. Payment page shows different amount or preflight recalculates at different rate.

**Root cause:** Owner changed pricing between when customer loaded the page and when they clicked Pay & Print.

**Customer experience:** Confusion. May abandon if price changed.

**Data consistency:** No. Pricing is read live from DB. No snapshot taken at estimate time. Fix: capture price snapshot in session metadata at estimate time.