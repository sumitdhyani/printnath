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
# Install dependencies (one-time, repeat after pulling new changes)
npm install

# Generate Prisma client
cd server && npx prisma generate && cd ..

# Build all packages (use -b for project references)
npx tsc -b

# Start DB + MinIO
docker compose -f deploy/docker-compose.yml up -d

# Run server
npm start -w server
```

> **Note:** Always use `npx tsc -b` from root, not `npx tsc`. Build mode (`-b`) follows project references and rebuilds dependencies in order.

> **Note:** Always use `npx tsc -b` from root, not `npx tsc`. Build mode (`-b`) follows project references and rebuilds dependencies in order.

## Future Features

See [Future Features](docs/future-features.md) for planned additions: per-print-type commission, owner/customer preload balance, Methods 2 & 3, touchscreen kiosk mode.

## Data Consistency

v1 uses channel-based architecture — each DB operation is a single Prisma call. Some cross-entity consistency (e.g., payment → job state) must be maintained by the routing layer.

See [Data Consistency Notes](docs/data-consistency-notes.md) for known limitations, failure scenarios, and future improvements.

## Running Tests

### Prerequisites

1. Install dependencies (one-time): `npm install`
2. Generate Prisma client: `cd server && npx prisma generate && cd ..`
3. PostgreSQL must be running:
```sh
docker compose -f deploy/docker-compose.yml up -d postgres
```

### Channel integration tests

Tests run against a real PostgreSQL database (`printnath_test`). Setup creates it and runs migrations automatically.

**Run all channel tests:**
```sh
npx vitest run --config channel-tests/vitest.config.ts
```

**Run a single channel (all tests in that channel directory):**
```sh
npx vitest run --config channel-tests/vitest.config.ts channel-tests/data-db
```

**Run a single test file:**
```sh
npx vitest run --config channel-tests/vitest.config.ts channel-tests/data-db/data-db.test.ts
```

**Run a specific test suite (by name):**
```sh
npx vitest run --config channel-tests/vitest.config.ts -t "Owner"
```

**Watch mode (re-run on file changes):**
```sh
npx vitest --config channel-tests/vitest.config.ts
```

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