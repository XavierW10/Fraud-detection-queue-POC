import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { resolveCurrentUser } from '@/auth/currentUser';
import { listAuditEventsForCase } from '@/db/audit';
import { createTestDb, type Db } from '@/db/client';
import { accounts, approvals, cases, users, type Case, type User } from '@/db/schema';
import { WorkflowError } from '@/workflow/errors';
import { claimCase, decideApproval, requestApproval, resolveCase } from '@/workflow/service';

let sqlite: Database.Database;
let db: Db;
let analyst: User;
let senior: User;

const addUser = (name: string, role: 'reviewer' | 'senior') =>
  db
    .insert(users)
    .values({ name, email: `${role}@example.com`, role })
    .returning()
    .get();

function addCase(overrides: Partial<Case> = {}): Case {
  const account = db
    .insert(accounts)
    .values({ externalRef: `ACC-${Math.random()}`, status: 'flagged' })
    .returning()
    .get();
  return db
    .insert(cases)
    .values({ accountId: account.id, policyVersion: 'test@1.0.0', ...overrides })
    .returning()
    .get();
}

const reload = (id: string) => db.select().from(cases).where(eq(cases.id, id)).get()!;
const actions = (id: string) => listAuditEventsForCase(db, id).map((event) => event.action);
const accountStatus = (kase: Case) =>
  db.select().from(accounts).where(eq(accounts.id, kase.accountId)).get()!.status;

/** A claimed case, at the state each test starts from. */
function claimed(requiresSenior: boolean, actor = analyst): Case {
  const kase = addCase({ requiresSenior });
  return claimCase(db, { caseId: kase.id, actor, expectedVersion: kase.version });
}

function awaitingApproval(): { case: Case; approvalId: string } {
  const kase = claimed(true);
  const result = requestApproval(db, {
    caseId: kase.id,
    actor: analyst,
    expectedVersion: kase.version,
    recommendedResolution: 'confirm_fraud',
    requesterReason: 'Structuring plus impossible travel.',
  });
  return { case: result.case, approvalId: result.approval.id };
}

const failsWith = (code: string, run: () => unknown) =>
  expect(run).toThrow(expect.objectContaining({ name: 'WorkflowError', code }) as Error);

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
  analyst = addUser('Xavier Warmerdam', 'reviewer');
  senior = addUser('Jane Doe', 'senior');
});

afterEach(() => {
  sqlite.close();
});

describe('claiming', () => {
  it('moves an unassigned pending case into review under its claimant', () => {
    const kase = claimed(false);

    expect(kase.status).toBe('in_review');
    expect(kase.assignedTo).toBe(analyst.id);
    expect(kase.lockedBy).toBe(analyst.id);
    expect(kase.lockedAt).toBeInstanceOf(Date);
    expect(actions(kase.id)).toEqual(['open']);
  });

  it('refuses a case someone else already holds, and a stale version', () => {
    const kase = claimed(false);

    failsWith('forbidden', () =>
      claimCase(db, { caseId: kase.id, actor: senior, expectedVersion: kase.version }),
    );
    failsWith('conflict', () =>
      claimCase(db, { caseId: kase.id, actor: analyst, expectedVersion: kase.version - 1 }),
    );
  });
});

describe('direct resolution', () => {
  it('lets the assignee close a below-threshold case and clears the account', () => {
    const kase = claimed(false);

    const closed = resolveCase(db, {
      caseId: kase.id,
      actor: analyst,
      expectedVersion: kase.version,
      resolution: 'approved',
      rationale: 'Customer confirmed the travel.',
    });

    expect(closed.status).toBe('approved');
    expect(closed.resolution).toBe('approved');
    expect(closed.resolvedAt).toBeInstanceOf(Date);
    expect(closed.lockedBy).toBeNull();
    expect(accountStatus(closed)).toBe('cleared');
    expect(actions(kase.id)).toEqual(['open', 'approve', 'account_status_change']);
  });

  it('requires a rationale', () => {
    const kase = claimed(false);

    failsWith('invalid_input', () =>
      resolveCase(db, {
        caseId: kase.id,
        actor: analyst,
        expectedVersion: kase.version,
        resolution: 'approved',
        rationale: '   ',
      }),
    );
  });

  it('blocks an analyst on a flagged case but allows the senior who holds it', () => {
    const analystCase = claimed(true);
    failsWith('forbidden', () =>
      resolveCase(db, {
        caseId: analystCase.id,
        actor: analyst,
        expectedVersion: analystCase.version,
        resolution: 'confirmed_fraud',
        rationale: 'Mule account.',
      }),
    );

    const seniorCase = claimed(true, senior);
    const closed = resolveCase(db, {
      caseId: seniorCase.id,
      actor: senior,
      expectedVersion: seniorCase.version,
      resolution: 'confirmed_fraud',
      rationale: 'Mule account.',
    });
    expect(closed.status).toBe('rejected');
    expect(accountStatus(closed)).toBe('confirmed_fraud');
  });

  it('will not reopen a closed case', () => {
    const kase = claimed(false);
    const closed = resolveCase(db, {
      caseId: kase.id,
      actor: analyst,
      expectedVersion: kase.version,
      resolution: 'approved',
      rationale: 'Legitimate activity.',
    });

    failsWith('invalid_transition', () =>
      resolveCase(db, {
        caseId: closed.id,
        actor: analyst,
        expectedVersion: closed.version,
        resolution: 'rejected',
        rationale: 'Changed my mind.',
      }),
    );
  });
});

describe('approval requests', () => {
  it('moves the case to awaiting approval with a pending request', () => {
    const { case: escalated, approvalId } = awaitingApproval();
    const approval = db.select().from(approvals).where(eq(approvals.id, approvalId)).get()!;

    expect(escalated.status).toBe('escalated');
    expect(approval.status).toBe('pending');
    expect(approval.requestedBy).toBe(analyst.id);
    expect(accountStatus(escalated)).toBe('under_review');
    expect(actions(escalated.id)).toEqual([
      'open',
      'escalate',
      'request_approval',
      'account_status_change',
    ]);
  });

  it('is pointless below the threshold', () => {
    const kase = claimed(false);
    failsWith('forbidden', () =>
      requestApproval(db, {
        caseId: kase.id,
        actor: analyst,
        expectedVersion: kase.version,
        recommendedResolution: 'approve',
        requesterReason: 'Second opinion, please.',
      }),
    );
  });
});

describe('senior decisions', () => {
  it('closes the case on the recommended resolution', () => {
    const { case: escalated, approvalId } = awaitingApproval();

    const { case: closed, approval } = decideApproval(db, {
      approvalId,
      actor: senior,
      decision: 'approve',
      reason: 'Agreed, referring to the AML team.',
      expectedApprovalVersion: 1,
      expectedCaseVersion: escalated.version,
    });

    expect(closed.status).toBe('rejected');
    expect(closed.resolution).toBe('confirmed_fraud');
    expect(closed.rationale).toBe('Agreed, referring to the AML team.');
    expect(approval.status).toBe('approved');
    expect(approval.decidedBy).toBe(senior.id);
    expect(approval.version).toBe(2);
    expect(accountStatus(closed)).toBe('confirmed_fraud');
    expect(actions(closed.id)).toContain('reject');
  });

  it('can send the case back to the reviewer instead', () => {
    const { case: escalated, approvalId } = awaitingApproval();

    const { case: returned, approval } = decideApproval(db, {
      approvalId,
      actor: senior,
      decision: 'return',
      reason: 'Check the counterparty first.',
      expectedApprovalVersion: 1,
      expectedCaseVersion: escalated.version,
    });

    expect(returned.status).toBe('in_review');
    expect(returned.assignedTo).toBe(analyst.id);
    expect(approval.status).toBe('rejected');
    expect(actions(returned.id)).toContain('return_to_review');
  });

  it('is senior-only, single-use, and never the requester', () => {
    const { case: escalated, approvalId } = awaitingApproval();
    const decision = {
      approvalId,
      decision: 'approve',
      reason: 'Signed off.',
      expectedApprovalVersion: 1,
      expectedCaseVersion: escalated.version,
    } as const;

    failsWith('forbidden', () => decideApproval(db, { ...decision, actor: analyst }));
    failsWith('invalid_input', () =>
      decideApproval(db, { ...decision, actor: senior, reason: '' }),
    );

    decideApproval(db, { ...decision, actor: senior });
    failsWith('conflict', () => decideApproval(db, { ...decision, actor: senior }));
  });

  it('will not let a senior decide their own request', () => {
    const kase = claimed(true, senior);
    const { case: escalated, approval } = requestApproval(db, {
      caseId: kase.id,
      actor: senior,
      expectedVersion: kase.version,
      recommendedResolution: 'reject',
      requesterReason: 'Want a second pair of eyes.',
    });

    failsWith('forbidden', () =>
      decideApproval(db, {
        approvalId: approval.id,
        actor: senior,
        decision: 'approve',
        reason: 'Self sign-off.',
        expectedApprovalVersion: approval.version,
        expectedCaseVersion: escalated.version,
      }),
    );
  });
});

describe('atomicity', () => {
  it('rolls the record change back when its audit event fails', () => {
    const kase = claimed(false);
    sqlite.exec(`
      CREATE TRIGGER reject_account_events BEFORE INSERT ON audit_events
      WHEN NEW.action = 'account_status_change'
      BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END;
    `);

    expect(() =>
      resolveCase(db, {
        caseId: kase.id,
        actor: analyst,
        expectedVersion: kase.version,
        resolution: 'approved',
        rationale: 'Legitimate activity.',
      }),
    ).toThrow(/audit unavailable/);

    const unchanged = reload(kase.id);
    expect(unchanged.status).toBe('in_review');
    expect(unchanged.version).toBe(kase.version);
    expect(unchanged.resolution).toBeNull();
    expect(accountStatus(kase)).toBe('flagged');
    expect(actions(kase.id)).toEqual(['open']);
  });
});

describe('demo user resolution', () => {
  it('reads the role from the database and falls back to the reviewer', () => {
    expect(resolveCurrentUser(db, senior.id)).toEqual(senior);
    expect(resolveCurrentUser(db, undefined)).toEqual(analyst);
    expect(resolveCurrentUser(db, 'not-a-user')).toEqual(analyst);
  });

  it('fails loudly with no seeded users', () => {
    const empty = createTestDb();
    try {
      expect(() => resolveCurrentUser(empty.db, undefined)).toThrow(WorkflowError);
    } finally {
      empty.sqlite.close();
    }
  });
});
