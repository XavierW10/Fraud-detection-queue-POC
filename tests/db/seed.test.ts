import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type Db } from '@/db/client';
import { seedDatabase } from '@/db/seed';
import { ACCOUNT_IDS, CASE_IDS, USER_IDS } from '@/db/seed-data';
import { accounts, approvals, auditEvents, cases, transactions, users } from '@/db/schema';

let sqlite: Database.Database;
let db: Db;

const rowCounts = () => ({
  users: db.select().from(users).all().length,
  accounts: db.select().from(accounts).all().length,
  transactions: db.select().from(transactions).all().length,
  cases: db.select().from(cases).all().length,
  approvals: db.select().from(approvals).all().length,
  auditEvents: db.select().from(auditEvents).all().length,
});

const caseFor = (id: string) => db.select().from(cases).where(eq(cases.id, id)).get()!;
const triggered = (id: string) =>
  caseFor(id)
    .triggeredRules.filter((rule) => rule.triggered)
    .map((rule) => rule.id);

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
  seedDatabase(db);
});

afterEach(() => {
  sqlite.close();
});

describe('demo seed', () => {
  it('is idempotent and deterministic', () => {
    const before = rowCounts();
    const snapshot = db.select().from(cases).all();

    seedDatabase(db);

    expect(rowCounts()).toEqual(before);
    expect(db.select().from(cases).all()).toEqual(snapshot);
  });

  it('restores a case the demo has already worked', () => {
    const before = caseFor(CASE_IDS.clear);
    expect(before.assignedTo).toBeNull();

    db.update(cases)
      .set({
        status: 'approved',
        assignedTo: USER_IDS.analyst,
        resolution: 'approved',
        rationale: 'Worked during the demo.',
        resolvedAt: new Date(),
        version: 9,
      })
      .where(eq(cases.id, CASE_IDS.clear))
      .run();

    seedDatabase(db);

    expect(caseFor(CASE_IDS.clear)).toEqual(before);
  });

  it('demonstrates each rule, including one account over the threshold', () => {
    expect(triggered(CASE_IDS.clear)).toEqual([]);
    expect(triggered(CASE_IDS.structuring)).toEqual(['structuring']);
    expect(triggered(CASE_IDS.geo)).toEqual(['geo_impossibility']);
    expect(triggered(CASE_IDS.sharedDevice)).toEqual(['shared_device_linkage']);
    expect(triggered(CASE_IDS.multiRule)).toEqual(['structuring', 'geo_impossibility']);

    expect(caseFor(CASE_IDS.multiRule).riskScore).toBe(80);
    expect(caseFor(CASE_IDS.multiRule).requiresSenior).toBe(true);
    expect(caseFor(CASE_IDS.structuring).requiresSenior).toBe(false);

    // Only cases a senior decided, or still owes a decision, are over the threshold.
    expect(caseFor(CASE_IDS.knownBad).requiresSenior).toBe(true);
    expect(caseFor(CASE_IDS.sharedDevice).requiresSenior).toBe(false);
  });

  it('links the shared device to the known-bad account', () => {
    const knownBad = db.select().from(accounts).where(eq(accounts.id, ACCOUNT_IDS.knownBad)).get()!;
    expect(knownBad.status).toBe('known_bad');

    const reason = caseFor(CASE_IDS.sharedDevice).triggeredRules.find(
      (rule) => rule.id === 'shared_device_linkage',
    )!.reason;
    expect(reason).toContain(ACCOUNT_IDS.knownBad);
    expect(reason).toContain('known_bad');
  });

  it('covers the workflow states and the users who drive them', () => {
    expect(
      db
        .select()
        .from(cases)
        .all()
        .map((c) => c.status)
        .sort(),
    ).toEqual(['approved', 'escalated', 'in_review', 'pending', 'pending', 'rejected']);
    expect(
      db
        .select()
        .from(approvals)
        .all()
        .map((a) => a.status)
        .sort(),
    ).toEqual(['approved', 'pending']);
    expect(
      db
        .select()
        .from(users)
        .all()
        .map((u) => [u.name, u.role]),
    ).toEqual([
      ['Xavier Warmerdam', 'reviewer'],
      ['Jane Doe', 'senior'],
    ]);
  });
});
