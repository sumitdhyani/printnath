import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import path from 'path';

export const TEST_DB_URL =
  process.env.TEST_DB_URL ?? 'postgresql://postgres:postgres@localhost:5432/printnath_test';
export const MAIN_DB_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/printnath';

// Runs once for the whole test run (called from global-setup.ts)
export async function setupDatabase() {
  const serverDir = path.resolve(__dirname, '..', 'server');
  execSync('npx prisma generate', { cwd: serverDir, stdio: 'pipe' });

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

  const setupClient = new PrismaClient({ datasourceUrl: MAIN_DB_URL });
  try {
    await setupClient.$executeRawUnsafe(`CREATE DATABASE printnath_test`);
  } catch { /* DB already exists */ }
  await setupClient.$disconnect();

  execSync(`DATABASE_URL="${TEST_DB_URL}" npx prisma db push --force-reset --accept-data-loss`, {
    cwd: serverDir,
    stdio: 'pipe',
  });
}