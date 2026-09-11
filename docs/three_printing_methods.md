# Three Printing Methods for the Print Network

The platform can support three customer-facing printing flows. All three eventually converge on the same server-side **Print Job** and the same gateway/printer execution pipeline.

## Method 1 — Scan & Print (on-site)

### Best for
Spontaneous, one-off printing when customer already at participating shop.

### Flow

```text
Customer sends document(s) to fixed WhatsApp business number
        ↓
Goes to supporting shop (or scans using saved picture)
        ↓
Scans shop QR
        ↓
Opens browser link
        ↓
Sees all uploaded documents
        ↓
Configures params (copies, color/BW, single/double side)
        ↓
Selects "Pay and Print"
        ↓
Sees payment QR code
        ↓
Pays
        ↓
Documents get printed
```

### Identity
Customer can remain anonymous (no phone/OTP at shop). Platform records transaction data (shop, timestamp, job size, print options, price, payment status) but no persistent customer identity.

### Advantages
- Lowest friction for spontaneous printing
- No account or OTP required at shop
- Works for both staffed shops and unattended kiosks

### Disadvantages
- Customer must have document available on phone at print time
- No cross-location analytics without identity

---

## Method 2 — Pay first, print later with OTP

### Best for
Customers who want to prepare documents and pay before arrival, then release print at any shop.

### Flow

```text
Customer sends document(s) to fixed WhatsApp business number
        ↓
Receives "Pay and Print Later" button in WhatsApp
        ↓
Sees all uploaded documents
        ↓
Configures params (copies, color/BW, single/double side)
        ↓
Presses button
        ↓
QR code generated
        ↓
Pays and receives OTP on WhatsApp
        ↓
(Later...)
Goes to supporting shop (or scans using saved picture)
        ↓
Scans shop QR
        ↓
Opens browser link
        ↓
Selects "Print using mobile and OTP"
        ↓
Enters mobile number and existing OTP
        ↓
Gets print
```

### Identity
Customer identified by WhatsApp number. No separate OTP at shop — payment OTP doubles as release token.

### Advantages
- Customer can prepare documents before arrival
- Pay once, print later — no payment friction at shop
- Works at any supporting shop (scan QR to release)
- Customer identity captured without extra auth step at shop

### Disadvantages
- More steps than Method 1
- Requires WhatsApp integration
- OTP must be preserved by customer until shop visit

---

## Method 3 — Pay first, print at remote kiosk

### Best for
Customers who want to trigger printing at a specific remote location without physically visiting to release.

### Flow

```text
Customer sends document(s) to fixed WhatsApp business number
        ↓
Receives "Pay and Print Later" button in WhatsApp
        ↓
Sees all uploaded documents
        ↓
Configures params (copies, color/BW, single/double side)
        ↓
Presses "Done" button
        ↓
QR code generated
        ↓
Pays and receives OTP on WhatsApp
        ↓
Hits "Print using kioskId" button
        ↓
Enters kioskId
        ↓
Print generated on remote kiosk
        ↓
Customer goes to kiosk to pick up
```

### Identity
Customer identified by WhatsApp number. Print triggered remotely via kioskId.

### Advantages
- Fully remote print triggering — no physical visit needed to start printing
- Print ready for pickup at destination kiosk
- No QR scanning needed at destination
- Enables delivery/pickup workflow

### Disadvantages
- Customer must know specific kioskId
- Kiosk must be registered and mapped to gateway
- Print happens unattended — requires monitoring for errors

---

# Unified Architecture

All three methods converge into the same server-side **Print Job** state machine and gateway execution pipeline.

```text
                         CUSTOMER ENTRY
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
    Method 1            Method 2            Method 3
   Scan & Print       Pay & OTP           Remote Kiosk
    (anonymous)       (WhatsApp ID)       (WhatsApp ID)
          │                   │                   │
          └───────────────────┼───────────────────┘
                              ↓
                       Print Session
                              ↓
                         Print Job
                              ↓
                    Server-side lifecycle
                              ↓
                         Gateway
                              ↓
                        Printer(s)
```

## State machine separation

Customer entry paths share a common execution pipeline:

```text
Customer Session
    mode = ANONYMOUS | WHATSAPP_PAY_LATER | WHATSAPP_REMOTE
             │
             └──── creates ────→ Print Job
                                      │
                                      ↓
                  common Print Job state machine
```

For example, the common job lifecycle remains:

```text
CREATED
  ↓
PREFLIGHT_PENDING
  ↓
PAYMENT_PENDING
  ↓
PAID
  ↓
AUTHORIZED
  ↓
DISPATCHED
  ↓
ACCEPTED
  ↓
QUEUED
  ↓
PRINTING
  ↓
COMPLETED
```

The method distinction is session context and customer identity, not a reason to duplicate the physical execution state machine.

---

# Recommended Product Strategy

Support all three methods:

### Default fast path
**Method 1 — Scan & Print**

Maximum conversion, minimum friction. Use for spontaneous walk-in customers.

### Convenience path
**Method 2 — Pay first, print later with OTP**

For customers who want to prepare documents beforehand and pay before arrival. Gives platform customer identity without OTP at shop.

### Remote path
**Method 3 — Pay first, print at remote kiosk**

For customers who want to trigger printing at a specific kiosk remotely. Enables pickup workflow.

The central product idea:

> **Print immediately from any participating endpoint, or prepare documents beforehand and redeem them later anywhere on the network.**
