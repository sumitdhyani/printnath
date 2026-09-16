import { setupDatabase } from './db-setup';

export default async function globalSetup() {
  await setupDatabase();
}