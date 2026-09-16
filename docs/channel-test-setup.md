# Channel Test Setup

## Overview

Channel tests use a real PostgreSQL database. The test infrastructure is split into three files to avoid race conditions when multiple test files run in the same suite.

## File Structure

```
channel-tests/
├── db-setup.ts        # Database creation + schema push (no vitest hooks)
├── global-setup.ts    # Vitest globalSetup — calls db-setup once per run
├── setup.ts           # Vitest setupFiles — per-test cleanup hooks
├── vitest.config.ts   # Vitest configuration
├── data-db/           # Data DB channel tests
│   └── data-db.test.ts
└── gateway/           # Gateway channel tests
    └── gateway.test.ts
```

## Execution Order

### 1. Global Setup (once per `vitest run`)

`global-setup.ts` runs before any test file. It:

1. Generates Prisma client via `npx prisma generate`
2. Checks PostgreSQL is reachable at `localhost:5432`
3. Creates `printnath_test` database if it doesn't exist
4. Pushes the Prisma schema via `prisma db push --force-reset --accept-data-loss`

This runs **once** — not per test file. This prevents race conditions where two test files both try to `--force-reset` the same database.

### 2. Per-File Setup

`setup.ts` runs as `setupFiles` in vitest — its hooks execute for every test file.

#### `beforeEach` — Clean Database

Only cleans the database for test files that actually use it (`data-db`). Detected via `process.env.VITEST_FILE`. Gateway channel tests do NOT clean the database — they don't use Prisma, and wiping rows would corrupt concurrently running data-db tests.

#### `afterAll` — Final Cleanup

Same guard — only cleans DB for `data-db` test files.

### 3. Test Execution

Each test file runs in its own vitest worker. Tests within a file run sequentially.

#### Data DB Tests

Each test within a `describe` block may have its own `beforeEach` that creates prerequisite rows. The setup file's `beforeEach` (clean DB) runs FIRST, then the describe block's `beforeEach` creates fresh data.

#### Gateway Channel Tests

Gateway tests start a real HTTP and WebSocket server. They mock `sendToRouter` and `docStore.getArtifactStream`. A fake gateway device connects via real WebSocket:

```
gateway.test.ts
├── createMockDeps()     # Mock sendToRouter + docStore
├── initGatewayChannel() # Starts real HTTP + WS server
├── WebSocket client     # Simulates gateway device
└── fetch()              # Makes real HTTP requests
```

## Database URL

The test database URL is configurable via `TEST_DB_URL` environment variable:

```
TEST_DB_URL=postgresql://user:pass@host:5432/printnath_test
```

Defaults to `postgresql://postgres:postgres@localhost:5432/printnath_test`.

The main Prisma schema URL (`DATABASE_URL`) defaults to `postgresql://postgres:postgres@localhost:5432/printnath`.

## Running Tests

```sh
# Full suite (requires PostgreSQL running)
docker compose -f deploy/docker-compose.yml up -d postgres
npx vitest run --config channel-tests/vitest.config.ts

# Single test file
npx vitest run --config channel-tests/vitest.config.ts channel-tests/data-db

# Single test by name
npx vitest run --config channel-tests/vitest.config.ts -t "Owner"

# Watch mode (re-runs on file changes)
npx vitest --config channel-tests/vitest.config.ts
```

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Cannot reach Postgres` | Docker not running. Start with `docker compose -f deploy/docker-compose.yml up -d postgres` |
| `Unique constraint failed on typname` | Two test files ran `db push --force-reset` concurrently. Run with single thread or check `globalSetup` is configured |
| `Session not created` / `Gateway not found` in data-db tests | Gateway test's `beforeEach` cleaned the shared DB. Ensure `process.env.VITEST_FILE` guard is in place |
| Port 18901 in use | Gateway test uses fixed port. Kill the process using it or change `TEST_PORT` in the test file |