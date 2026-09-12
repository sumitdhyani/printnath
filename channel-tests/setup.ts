import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import path from 'path';

const TEST_DB_URL =
  process.env.TEST_DB_URL ?? 'postgresql://postgres:postgres@localhost:5432/printnath_test';
const MAIN_DB_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/printnath';

globalThis.__TEST_DB_URL__ = TEST_DB_URL;

let prisma: PrismaClient;

beforeAll(async () => {
  // Ensure Prisma client is generated
  const serverDir = path.resolve(__dirname, '..', 'server');
  execSync('npx prisma generate', { cwd: serverDir, stdio: 'pipe' });

  // Check DB reachable
  const checkClient = new PrismaClient({ datasourceUrl: MAIN_DB_URL });
  try {
    await checkClient.$connect();
  } catch {
    checkClient.$disconnect();
    throw new Error(
      `Cannot reach Postgres at localhost:5432. Start it first:\n` +
      `  docker compose -f deploy/docker-compose.yml up -d postgres\n` +
      `Then run tests again.`
    );
  }
  await checkClient.$disconnect();

  // Create test database
  const setupClient = new PrismaClient({ datasourceUrl: MAIN_DB_URL });
  try {
    await setupClient.$executeRawUnsafe(
      `CREATE DATABASE printnath_test WITH OWNER postgres`,
    );
  } catch {
     // DB already exists
  }
  await setupClient.$disconnect();

  // Run migrations on test DB
  execSync(`DATABASE_URL="${TEST_DB_URL}" npx prisma migrate deploy`, {
    cwd: path.resolve(__dirname, '..', 'server'),
    stdio: 'pipe',
  });
});

beforeEach(async () => {
  prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
  await cleanDb(prisma);
  await prisma.$disconnect();
});

afterAll(async () => {
  prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
  await cleanDb(prisma);
  await prisma.$disconnect();
});

declare global {
  var __TEST_DB_URL__: string;
}

async function cleanDb(client: PrismaClient) {
  await client.jobDocument.deleteMany();
  await client.payment.deleteMany();
  await client.printJob.deleteMany();
  await client.document.deleteMany();
  await client.customerSession.deleteMany();
  await client.pricing.deleteMany();
  await client.gateway.deleteMany();
  await client.owner.deleteMany();
}