# PrintNath

Distributed print-service network. Connects existing print-shop printers to a central backend via a small on-premise gateway appliance.

## Concept

Customers send documents through **WhatsApp**, visit a participating shop, scan the **shop QR code**, authenticate (anonymous or OTP), select documents, configure print options, pay digitally (UPI), and the gateway auto-prints on the shop's existing printer.

No touchscreen kiosk required. The customer's phone is the UI.

## Architecture

```
                        ┌──────────────┐
                        │   ROUTER     │
                        │ (adapter +   │
                        │  dispatcher) │
                        └──┬──┬──┬──┬──┘
                           │  │  │  │
              ┌────────────┘  │  │  └──────────┐
              ▼               ▼  ▼             ▼
        User Channel     Gateway   Data DB    Doc Store
        (HTTP + WS)      Channel   Channel    (MinIO/S3)
```

- **Server:** TypeScript (Node.js), Express, Prisma, PostgreSQL
- **Gateway:** TypeScript (Node.js) on Raspberry Pi Zero 2 W
- **Shared types:** npm workspace (`@printnath/shared`)
- **State machines:** XState (Browser Session, Server Session, Print Job, Gateway Lifecycle, Printer State)

## Printing Methods

| Method | Description | Status |
|---|---|---|
| **Method 1** — Scan & Print | Upload to WhatsApp → visit shop → scan QR → configure → pay → print | v1 scope |
| **Method 2** — Pay first, OTP release | Pre-pay, release at shop via OTP | Deferred |
| **Method 3** — Remote kiosk | Pre-pay, trigger print via kioskId | Deferred |

## Quick Start

```sh
# Install
npm install

# Build all packages
npx tsc -b

# Start DB + MinIO
docker compose -f deploy/docker-compose.yml up -d

# Run server
npm start -w server
```

## Data Consistency

v1 uses channel-based architecture — each DB operation is a single Prisma call. Some cross-entity consistency (e.g., payment → job state) must be maintained by the routing layer.

See [Data Consistency Notes](docs/data-consistency-notes.md) for known limitations, failure scenarios, and future improvements.

## Project Structure

```
printnath/
├── docs/              # Design documents
├── shared/            # Shared types, protocols, state machines
├── server/            # Central backend
│   ├── prisma/        # Schema + migrations
│   └── src/channels/  # Channel-based architecture
├── gateway/           # On-premise gateway software
└── deploy/            # Docker, scripts
```