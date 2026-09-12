# Future Features

Features deferred from v1. Ordered by estimated priority.

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

## 5. Touchscreen Kiosk Mode

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