import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

export type Db = ReturnType<typeof createDb>['db'];

export function createDb(url: string) {
  if (url !== ':memory:') {
    fs.mkdirSync(path.dirname(url), { recursive: true });
  }
  const sqlite = new Database(url);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}

export function runMigrations(db: ReturnType<typeof createDb>['db']) {
  migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
}

/** In-memory database with migrations applied — used by tests. */
export function createTestDb() {
  const { sqlite, db } = createDb(':memory:');
  runMigrations(db);
  return { sqlite, db };
}

const databaseUrl = process.env.DATABASE_URL ?? path.join(process.cwd(), 'data', 'app.db');

const globalForDb = globalThis as unknown as { __db?: ReturnType<typeof createDb> };

const connection = globalForDb.__db ?? createDb(databaseUrl);
if (process.env.NODE_ENV !== 'production') globalForDb.__db = connection;

export const sqlite = connection.sqlite;
export const db = connection.db;
