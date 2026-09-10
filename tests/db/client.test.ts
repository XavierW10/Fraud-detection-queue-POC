import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const dataDir = path.join(process.cwd(), 'data');
let opened: string | undefined;

afterEach(() => {
  delete (globalThis as { __db?: unknown }).__db;
  if (opened) fs.rmSync(path.dirname(opened), { recursive: true, force: true });
  opened = undefined;
});

describe('database client', () => {
  it('opens no database when the module is imported', async () => {
    const before = fs.existsSync(dataDir);

    await import('@/db/client');

    expect(fs.existsSync(dataDir)).toBe(before);
  });

  it('opens the configured database only on first use, then reuses it', async () => {
    const { getConnection } = await import('@/db/client');
    opened = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fraud-db-')), 'app.db');
    process.env.DATABASE_URL = opened;

    try {
      const connection = getConnection();
      expect(fs.existsSync(opened)).toBe(true);
      expect(getConnection()).toBe(connection);
      connection.sqlite.close();
    } finally {
      delete process.env.DATABASE_URL;
    }
  });
});
