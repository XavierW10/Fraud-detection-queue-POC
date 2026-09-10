import fs from 'node:fs';
import { getDb, resolveDatabaseUrl, runMigrations } from './client';
import { seedDatabase } from './seed';

/**
 * Rebuilds the demo database from scratch. `db:seed` restores the seeded rows
 * but cannot remove what the demo added — audit events are append-only, and
 * new cases or approvals have ids the seed does not know about — so the file
 * is deleted rather than emptied.
 */
const url = resolveDatabaseUrl();
if (url === ':memory:') {
  throw new Error('DATABASE_URL is :memory:; there is nothing to reset.');
}

for (const file of [url, `${url}-wal`, `${url}-shm`]) {
  fs.rmSync(file, { force: true });
}

const db = getDb();
runMigrations(db);
seedDatabase(db);
console.log(`Rebuilt ${url} and reloaded the demo dataset.`);
