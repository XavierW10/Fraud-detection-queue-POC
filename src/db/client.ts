import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

export type Connection = ReturnType<typeof createDb>;
export type Db = Connection['db'];

/** The handle inside `db.transaction(...)`; interchangeable with `Db` for queries. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Accepted by anything that must work both standalone and inside a transaction. */
export type DbLike = Db | Tx;

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

/**
 * Migrations that add or change constraints rebuild the table, which SQLite
 * only tolerates with foreign keys disabled — and the pragma is a no-op inside
 * the transaction the migrator opens, so it is toggled here instead. Integrity
 * is re-checked before foreign keys go back on.
 */
export function runMigrations(db: Db) {
  const sqlite = db.$client;
  sqlite.pragma('foreign_keys = OFF');
  try {
    migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
    const violations = sqlite.pragma('foreign_key_check') as unknown[];
    if (violations.length > 0) {
      throw new Error(`Migration left ${violations.length} foreign key violation(s)`);
    }
  } finally {
    sqlite.pragma('foreign_keys = ON');
  }
}

/** In-memory database with migrations applied — used by tests. */
export function createTestDb() {
  const { sqlite, db } = createDb(':memory:');
  runMigrations(db);
  return { sqlite, db };
}

/** Where the application database lives; `:memory:` is honoured for tooling. */
export function resolveDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? path.join(process.cwd(), 'data', 'app.db');
}

const globalForDb = globalThis as unknown as { __db?: Connection };

/**
 * The application connection, opened on first use. Importing this module must
 * stay side-effect free so tests and tooling never touch the on-disk database.
 */
export function getConnection(): Connection {
  const existing = globalForDb.__db;
  if (existing) return existing;

  const connection = createDb(resolveDatabaseUrl());
  globalForDb.__db = connection;
  return connection;
}

export function getDb(): Db {
  return getConnection().db;
}
