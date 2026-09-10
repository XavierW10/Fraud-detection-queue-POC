import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type Db } from '@/db/client';
import { insertAuditEvent, listAuditEventsForCase } from '@/db/audit';
import { accounts, auditEvents, cases, transactions, users } from '@/db/schema';

let sqlite: Database.Database;
let db: Db;

function baseFixtures() {
  const reviewer = db
    .insert(users)
    .values({ email: 'reviewer@example.com', role: 'reviewer' })
    .returning()
    .get();
  const account = db
    .insert(accounts)
    .values({ externalRef: 'ACC-1', status: 'flagged' })
    .returning()
    .get();
  const kase = db
    .insert(cases)
    .values({ accountId: account.id, policyVersion: 'test-policy@1' })
    .returning()
    .get();
  return { reviewer, account, kase };
}

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
});

afterEach(() => {
  sqlite.close();
});

describe('schema defaults', () => {
  it('defaults accounts.status to clear and cases to pending', () => {
    const account = db.insert(accounts).values({ externalRef: 'ACC-DEFAULT' }).returning().get();
    expect(account.status).toBe('clear');

    const kase = db
      .insert(cases)
      .values({ accountId: account.id, policyVersion: 'p@1' })
      .returning()
      .get();
    expect(kase.status).toBe('pending');
    expect(kase.requiresSenior).toBe(false);
    expect(kase.triggeredRules).toEqual([]);
    expect(kase.version).toBe(1);
    expect(kase.resolution).toBeNull();
  });

  it('stores transaction coordinates and device', () => {
    const account = db.insert(accounts).values({ externalRef: 'ACC-TX' }).returning().get();
    db.insert(transactions)
      .values({
        accountId: account.id,
        amount: 1234.56,
        timestamp: new Date('2024-01-01T00:00:00Z'),
        latitude: 51.5,
        longitude: -0.12,
        deviceId: 'device-1',
      })
      .run();

    const [tx] = db.select().from(transactions).where(eq(transactions.accountId, account.id)).all();
    expect(tx.amount).toBeCloseTo(1234.56);
    expect(tx.latitude).toBeCloseTo(51.5);
    expect(tx.deviceId).toBe('device-1');
  });

  it('enforces foreign keys', () => {
    expect(() => db.insert(cases).values({ accountId: 999, policyVersion: 'p@1' }).run()).toThrow(
      /FOREIGN KEY/i,
    );
  });

  it('creates no secondary indexes', () => {
    const indexes = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL")
      .all();
    expect(indexes).toEqual([]);
  });
});

describe('audit_events append-only', () => {
  it('records actor events and system events with a null actorId', () => {
    const { reviewer, kase } = baseFixtures();

    insertAuditEvent(db, {
      caseId: kase.id,
      actorId: null,
      action: 'account_status_change',
      fromStatus: 'clear',
      toStatus: 'flagged',
      metadata: { source: 'ingestion' },
    });
    insertAuditEvent(db, {
      caseId: kase.id,
      actorId: reviewer.id,
      action: 'open',
      fromStatus: 'pending',
      toStatus: 'in_review',
    });

    const events = listAuditEventsForCase(db, kase.id);
    expect(events.map((e) => [e.action, e.actorId])).toEqual([
      ['account_status_change', null],
      ['open', reviewer.id],
    ]);
    expect(events[0].metadata).toEqual({ source: 'ingestion' });
  });

  it('blocks UPDATE and DELETE at the database level', () => {
    const { kase } = baseFixtures();
    const event = insertAuditEvent(db, { caseId: kase.id, action: 'open' });

    expect(() => sqlite.prepare('UPDATE audit_events SET action = ?').run('tampered')).toThrow(
      /append-only/,
    );
    expect(() => db.delete(auditEvents).where(eq(auditEvents.id, event.id)).run()).toThrow(
      /append-only/,
    );

    expect(listAuditEventsForCase(db, kase.id)).toHaveLength(1);
  });

  it('has no mutable columns', () => {
    const columns = sqlite
      .prepare('PRAGMA table_info(audit_events)')
      .all()
      .map((c) => (c as { name: string }).name);
    expect(columns).not.toContain('updated_at');
  });
});
