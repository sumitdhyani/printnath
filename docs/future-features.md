# Future Features

Features deferred from v1. Ordered by estimated priority.

## 0. Email as Primary Owner Identifier

**Description:** Replace phone with email as the primary key for `Owner` table. Email is more stable across role/personnel changes (e.g., a public office's official email stays the same when the head of office changes).

**Migration difficulty:** Easy. No manual steps. Prisma generates migration SQL. Single backfill step copies phone to email temporarily.

**Schema change:**
```prisma
model Owner {
  email String  @id
  phone String?
  // ... rest same
}
```

**Steps:** Add email column → backfill email from phone → drop old PK → set email as new PK → update FK references on Gateway and Pricing. See data_consistency_notes.md for FK chain details.

**Backward compatibility:** Phone remains as a regular field (not PK) for customer-facing search.

## 1. Billing Modes

**Description:** Support multiple billing scenarios beyond per-job payment. Single schema with configurable `billingMode` on Gateway. Payer is always either end customer or gateway owner.

**Target billing modes:**

| Mode | Who pays | When | Use case |
|---|---|---|---|
| `PAY_PER_JOB` | End customer | Each print | Shop walk-in (v1 default) |
| `PREPAID_OWNER` | Owner | Preloaded | Hostel, coworking |
| `PREPAID_CUSTOMER` | End customer | Preloaded | Frequent customer |
| `INVOICE_OWNER` | Owner | End of month | Office, institution |

**Schema addition:**
```prisma
model Gateway {
  billingMode BillingMode @default(PAY_PER_JOB)
}
```

**No new tables for payment.** Payment flow varies by mode but reuses existing tables. UI varies based on `Gateway.billingMode`. See also Owner Preload and Customer Preload features.

**Migration:** Add `billingMode` column to Gateway with default `PAY_PER_JOB`. Zero impact on existing records.

## 1. Per-Print-Type Commission

**Description:** Platform commission calculated per print type (color/BW, A4/A3, duplex/single) rather than flat fee per job.

**Current v1 behavior:** `PrintJob.platformFeePaise` is a single flat value (fixed fee or flat percentage).

**Target behavior:**
```prisma
model CommissionRate {
  pageType String  // B_W_A4 | COLOR_A4 | B_W_A3 | COLOR_A3
  fixedPaise Int   // platform fee per page
  isActive Boolean @default(true)
  @@unique([pageType])
}
```
Platform fee per job = Σ(CommissionRate × JobDocument.pageCount × JobDocument.copies) per document.

**Migration:** No manual steps. New logic replaces calculation of `platformFeePaise` on PrintJob creation. Existing jobs keep their original `platformFeePaise` (backfilling would change historical accounting). Schema addition only — no existing table changes.

**See:** known_issues.md §6 (pricing change race condition also addressed by this feature — price snapshot per document).

---

## 2. Owner Preload Balance

**Description:** Owner credits money to their platform account. Print jobs deduct from preload balance instead of requiring per-job payment from customer (useful for high-volume or contract printing).

**Target schema addition:**
```prisma
model Owner {
  preloadBalancePaise Int @default(0)
}

model OwnerTransaction {
  id         String   @id @default(uuid())
  ownerPhone String
  amountPaise Int     // positive = credit, negative = debit
  type       String   // PRELOAD | PRINT_DEDUCTION | WITHDRAWAL
  jobId      String?  // null for preload/withdrawal
  createdAt  DateTime @default(now())
}
```

**Flow:**
1. Owner transfers money to platform account
2. Platform records credit in `OwnerTransaction` (PRELOAD), increases `Owner.preloadBalancePaise`
3. On print job creation, if owner opts for preload billing:
   - Deduct from balance instead of charging customer
   - Record debit in `OwnerTransaction` (PRINT_DEDUCTION)
4. Low balance alert when below threshold

**Migration:** Add Owner table fields + new transaction table. New column in PrintJob to indicate billing mode (per-job vs preload). Zero existing records affected — all are per-job by default.

**UI implications:** Owner dashboard: view balance, transaction history, preload button. Alert config.

---

## 3. Customer Preload Balance

**Description:** Same concept as Owner Preload (feature #2) but at customer level. Customer preloads money, subsequent prints deduct from balance. Enables frictionless repeat printing.

**Target schema addition:**
```prisma
model Customer {
  phone             String  @id
  preloadBalancePaise Int   @default(0)
  createdAt         DateTime @default(now())
}
// CustomerTransaction table mirrors OwnerTransaction
```

**Flow:** Same as Owner Preload. Customer credits account → prints deduct from balance → low balance alert.

**Relation to v1 Customer model:** v1 has no `Customer` table. This feature requires adding it. Customer identity resolved from session phone (OTP-authenticated sessions).

**Migration:** Add `Customer` table. Link to `CustomerSession.phone` for existing customers. Balance starts at zero for all existing customers.

---

## 4. Methods 2 & 3 (WhatsApp payment flows)

**Description:** Pay-first-print-later (Method 2) and Remote Kiosk (Method 3) flows. Deferred — see three_printing_methods.md for full spec.

**Dependencies:** WhatsApp channel integration, OTP-as-release-token, kioskId → gateway resolution.

---

## 5. Cancel Job (CANCEL_JOB protocol message)

**Description:** Server-initiated cancellation of an in-flight print job on the gateway. Server sends `CANCEL_JOB` via WebSocket, gateway stops printing (if possible) and reports status.

**Why deferred:** v1 customer is physically at the shop — no scenario where they pay then cancel mid-print. Server-side cancellation (timeout, refund) doesn't need gateway protocol — just update DB and skip re-dispatch on reconnect.

**Wire protocol (when implemented):**
```
Server → Gateway: { type: "CANCEL_JOB", payload: { jobId, reason } }
Gateway → Server: { type: "JOB_STATUS", payload: { jobId, status: "CANCELLED", reason } }
```

**Dependencies:** Customer-facing cancel button in browser, gateway-side print job abort logic, refund flow.

**Migration:** Add `CANCEL_JOB` handler to gateway channel `In_Req`. Add case in gateway WebSocket message router. Zero impact on existing v1 records — cancelled jobs already handled server-side.

---

## 6. Touchscreen Kiosk Mode

**Description:** Physical kiosk with touchscreen UI. Operates as a different frontend on the same backend. Uses the same channel architecture — new "Kiosk Channel" instead of "User Channel" for the browser.

**Dependencies:** Hardware (touchscreen + enclosure), kiosk UI framework (separate from browser UI).

---

## Migration Guidelines

| Feature | Schema change? | Data backfill? | Existing API changes? |
|---|---|---|---|
| Per-type commission | New table only | No | Calculation logic only |
| Owner preload | New table + Owner column | No (balance=0) | New methods on Owner |
| Customer preload | New table | No | New methods |
| Methods 2 & 3 | Session state machine additions | No | New session modes |
| Kiosk mode | No | No | New channel only |