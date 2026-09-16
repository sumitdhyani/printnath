import { PrismaClient } from '@prisma/client';
import { TEST_DB_URL } from './db-setup';

globalThis.__TEST_DB_URL__ = TEST_DB_URL;

let prisma: PrismaClient;

beforeEach(async () => {
  // Only clean DB for data-db tests — gateway tests share the DB but don't use it
  if (process.env.VITEST_FILE?.includes('data-db')) {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await cleanDb(prisma);
    await prisma.$disconnect();
  }
});

afterAll(async () => {
  if (process.env.VITEST_FILE?.includes('data-db')) {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await cleanDb(prisma);
    await prisma.$disconnect();
  }
});

declare global {
  var __TEST_DB_URL__: string;
}

async function cleanDb(client: PrismaClient) {
  const tables = [
    'jobDocument', 'payment', 'printJob', 'document',
    'customerSession', 'pricing', 'gateway', 'owner',
  ];
  for (const table of tables) {
    try {
      await (client as any)[table].deleteMany();
    } catch { /* table may not exist */ }
  }
}