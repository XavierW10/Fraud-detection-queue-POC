import type Database from 'better-sqlite3';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type Db } from '@/db/client';
import { accounts, cases, users, type Case, type User } from '@/db/schema';
import { claimCase, requestApproval } from '@/workflow/service';

// The handlers reach for the app database and the cookie-bound demo user; both
// are swapped for the in-memory database and a user the test chooses.
let db: Db;
let sqlite: Database.Database;
let actor: User;

vi.mock('@/db/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/db/client')>();
  return { ...original, getDb: () => db };
});

vi.mock('@/auth/currentUser', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/auth/currentUser')>();
  return { ...original, getCurrentUser: async () => actor };
});

const { GET: getCases } = await import('@/app/api/cases/route');
const { GET: getCase } = await import('@/app/api/cases/[caseId]/route');
const { POST: postClaim } = await import('@/app/api/cases/[caseId]/claim/route');
const { POST: postDecision } = await import('@/app/api/cases/[caseId]/decision/route');
const { POST: postRequestApproval } =
  await import('@/app/api/cases/[caseId]/request-approval/route');
const { GET: getApprovals } = await import('@/app/api/approvals/route');
const { POST: postApprovalDecision } =
  await import('@/app/api/approvals/[approvalId]/decision/route');
const { GET: getPolicy } = await import('@/app/api/policy/route');

type Json = Record<string, never> | Awaited<ReturnType<Response['json']>>;

const read = async (response: Response): Promise<[number, Json]> => [
  response.status,
  await response.json(),
];

const get = (url: string) => new Request(`http://localhost${url}`) as never;
const post = (body: unknown) =>
  new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) });
const params = <T extends object>(value: T) => ({ params: Promise.resolve(value) }) as never;

let analyst: User;
let senior: User;

function addCase(requiresSenior: boolean, externalRef: string): Case {
  const account = db.insert(accounts).values({ externalRef, status: 'flagged' }).returning().get();
  return db
    .insert(cases)
    .values({
      accountId: account.id,
      policyVersion: 'aml-transaction-monitoring-policy@1.0.0',
      requiresSenior,
      riskScore: requiresSenior ? 80 : 35,
    })
    .returning()
    .get();
}

beforeEach(() => {
  ({ sqlite, db } = createTestDb());
  analyst = db
    .insert(users)
    .values({ name: 'Xavier Warmerdam', email: 'x@example.com', role: 'reviewer' })
    .returning()
    .get();
  senior = db
    .insert(users)
    .values({ name: 'Jane Doe', email: 'j@example.com', role: 'senior' })
    .returning()
    .get();
  actor = analyst;
});

afterEach(() => {
  sqlite.close();
});

describe('reads', () => {
  it('lists the queue riskiest first and filters by status and assignment', async () => {
    const low = addCase(false, 'ACC-1001');
    addCase(true, 'ACC-1002');
    claimCase(db, { caseId: low.id, actor: analyst, expectedVersion: low.version });

    const [status, all] = await read(await getCases(get('/api/cases')));
    expect(status).toBe(200);
    expect(all.cases.map((row: Json) => row.account.externalRef)).toEqual(['ACC-1002', 'ACC-1001']);
    expect(all.currentUser.id).toBe(analyst.id);

    const [, mine] = await read(await getCases(get('/api/cases?assignedTo=me&status=in_review')));
    expect(mine.cases).toHaveLength(1);
    expect(mine.cases[0].assignee.name).toBe('Xavier Warmerdam');

    const [, flagged] = await read(await getCases(get('/api/cases?requiresSenior=true')));
    expect(flagged.cases.map((row: Json) => row.account.externalRef)).toEqual(['ACC-1002']);
  });

  it('returns a case with its account, transactions, approvals and audit trail', async () => {
    const kase = addCase(true, 'ACC-1002');
    claimCase(db, { caseId: kase.id, actor: analyst, expectedVersion: kase.version });

    const [status, body] = await read(await getCase(get('/'), params({ caseId: kase.id })));
    expect(status).toBe(200);
    expect(body.account.externalRef).toBe('ACC-1002');
    expect(body.transactions).toEqual([]);
    expect(body.auditEvents.map((event: Json) => [event.action, event.actor.name])).toEqual([
      ['open', 'Xavier Warmerdam'],
    ]);
  });

  it('answers for an unknown case, and for a malformed request', async () => {
    const [missing, notFound] = await read(await getCase(get('/'), params({ caseId: 'nope' })));
    expect([missing, notFound.error.code]).toEqual([404, 'not_found']);

    const [bad, invalid] = await read(await getCases(get('/api/cases?status=archived')));
    expect([bad, invalid.error.code]).toEqual([400, 'invalid_input']);
  });

  it('serves the policy in force', async () => {
    const [status, body] = await read(await getPolicy());
    expect(status).toBe(200);
    expect(body.policy.policyId).toBe('aml-transaction-monitoring-policy');
    expect(body.policy.escalationThreshold).toBe(60);
  });
});

describe('writes', () => {
  it('claims a case', async () => {
    const kase = addCase(false, 'ACC-1001');

    const [status, body] = await read(
      await postClaim(post({ expectedVersion: kase.version }), params({ caseId: kase.id })),
    );

    expect(status).toBe(200);
    expect(body.case.status).toBe('in_review');
    expect(body.case.assignedTo).toBe(analyst.id);
  });

  it('resolves a below-threshold case and reports a stale version as a conflict', async () => {
    const kase = addCase(false, 'ACC-1001');
    claimCase(db, { caseId: kase.id, actor: analyst, expectedVersion: kase.version });
    const decision = { resolution: 'approved', rationale: 'Customer confirmed the travel.' };

    const [stale, conflict] = await read(
      await postDecision(
        post({ ...decision, expectedVersion: kase.version }),
        params({ caseId: kase.id }),
      ),
    );
    expect(stale).toBe(409);
    expect(conflict.error.code).toBe('conflict');

    const [status, body] = await read(
      await postDecision(
        post({ ...decision, expectedVersion: kase.version + 1 }),
        params({ caseId: kase.id }),
      ),
    );
    expect(status).toBe(200);
    expect(body.case.resolution).toBe('approved');
  });

  it('refuses a decision with no rationale', async () => {
    const kase = addCase(false, 'ACC-1001');

    const [status, body] = await read(
      await postDecision(
        post({ expectedVersion: kase.version, resolution: 'approved', rationale: '' }),
        params({ caseId: kase.id }),
      ),
    );

    expect(status).toBe(400);
    expect(body.error.message).toContain('rationale');
  });

  it('sends a flagged case for approval and lets a senior close it', async () => {
    const kase = addCase(true, 'ACC-1002');
    const claimed = claimCase(db, {
      caseId: kase.id,
      actor: analyst,
      expectedVersion: kase.version,
    });

    const [requested, escalation] = await read(
      await postRequestApproval(
        post({
          expectedVersion: claimed.version,
          recommendedResolution: 'confirm_fraud',
          requesterReason: 'Structuring plus impossible travel.',
        }),
        params({ caseId: kase.id }),
      ),
    );
    expect(requested).toBe(200);
    expect(escalation.case.status).toBe('escalated');

    const [, queue] = await read(await getApprovals(get('/api/approvals?status=pending')));
    expect(queue.approvals).toHaveLength(1);
    expect(queue.approvals[0].requester.name).toBe('Xavier Warmerdam');

    const decision = post({
      decision: 'approve',
      reason: 'Confirmed, filing a SAR.',
      expectedApprovalVersion: escalation.approval.version,
      expectedCaseVersion: escalation.case.version,
    });

    actor = senior;
    const [status, body] = await read(
      await postApprovalDecision(decision, params({ approvalId: escalation.approval.id })),
    );
    expect(status).toBe(200);
    expect(body.case.status).toBe('rejected');
    expect(body.case.resolution).toBe('confirmed_fraud');
  });

  it('refuses an analyst the senior decision before reading the approval', async () => {
    const kase = addCase(true, 'ACC-1002');
    const claimed = claimCase(db, {
      caseId: kase.id,
      actor: analyst,
      expectedVersion: kase.version,
    });
    const { approval } = requestApproval(db, {
      caseId: kase.id,
      actor: analyst,
      expectedVersion: claimed.version,
      recommendedResolution: 'confirm_fraud',
      requesterReason: 'Structuring plus impossible travel.',
    });

    const [status, body] = await read(
      await postApprovalDecision(
        post({
          decision: 'approve',
          reason: 'Looks right to me.',
          expectedApprovalVersion: approval.version,
          expectedCaseVersion: claimed.version + 1,
        }),
        params({ approvalId: approval.id }),
      ),
    );

    expect(status).toBe(403);
    expect(body.error.code).toBe('forbidden');
  });
});
