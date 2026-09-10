import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auditEvents } from '@/db/schema';
import { CASE_IDS } from '@/db/seed-data';
import { policyStamp } from '@/policy/schema';
import { harnessFor, type App, type Json } from './harness';

const app = vi.hoisted(() => ({}) as App);

vi.mock('@/db/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/db/client')>();
  return { ...original, getDb: () => app.db };
});

vi.mock('@/auth/currentUser', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/auth/currentUser')>();
  return { ...original, getCurrentUser: async () => app.actor };
});

const { actAs, analyst, api, db, newFlaggedCase, senior, sqlite, start, stop } = harnessFor(app);

beforeEach(start);
afterEach(stop);

const auditCount = () => db().select().from(auditEvents).all().length;

/** The one approval the seed leaves outstanding, on the escalated multi-rule case. */
async function pendingApproval() {
  const [, queue] = await api.approvals('?status=pending');
  return queue.approvals[0];
}

describe('concurrency', () => {
  it('gives a contested case to one claimant and refuses every stale writer after', async () => {
    const [first, opened] = await api.claim(CASE_IDS.clear, 1);

    actAs(senior());
    const [second, lostRace] = await api.claim(CASE_IDS.clear, 1);
    expect([first, second]).toEqual([200, 409]);
    expect(lostRace.error.message).toContain('version');

    const events = auditCount();
    actAs(analyst());
    const [stale, refusal] = await api.decide(CASE_IDS.clear, {
      expectedVersion: opened.case.version - 1,
      resolution: 'approved',
      rationale: 'Nothing to see here.',
    });

    expect([stale, refusal.error.code]).toEqual([409, 'conflict']);
    expect(auditCount()).toBe(events);
    const [, detail] = await api.case(CASE_IDS.clear);
    expect([detail.case.status, detail.assignee.name]).toEqual(['in_review', 'Xavier Warmerdam']);
  });

  it('rejects a senior decision carrying a stale approval or case version', async () => {
    const pending = await pendingApproval();
    actAs(senior());

    const [staleApproval] = await api.decideApproval(pending.approval.id, {
      decision: 'approve',
      reason: 'Confirmed.',
      expectedApprovalVersion: pending.approval.version + 1,
      expectedCaseVersion: pending.case.riskScore, // deliberately not the case version
    });
    expect(staleApproval).toBe(409);

    const [, detail] = await api.case(pending.case.id);
    expect(detail.case.status).toBe('escalated');
    expect(detail.approvals[0].approval.status).toBe('pending');
  });

  it('decides an approval once', async () => {
    const pending = await pendingApproval();
    const [, detail] = await api.case(pending.case.id);
    actAs(senior());

    const decision = {
      decision: 'approve' as const,
      reason: 'Confirmed fraud; account referred to AML.',
      expectedApprovalVersion: pending.approval.version,
      expectedCaseVersion: detail.case.version,
    };
    const [first, closed] = await api.decideApproval(pending.approval.id, decision);
    const [second, refusal] = await api.decideApproval(pending.approval.id, decision);

    expect([first, second]).toEqual([200, 409]);
    expect(refusal.error.message).toContain('already been decided');
    expect(closed.case.status).toBe('rejected');
  });
});

describe('permissions', () => {
  it('lets only a senior decide an approval, and never its requester', async () => {
    const pending = await pendingApproval();
    const [, detail] = await api.case(pending.case.id);
    const decision = {
      decision: 'approve' as const,
      reason: 'Signing this off.',
      expectedApprovalVersion: pending.approval.version,
      expectedCaseVersion: detail.case.version,
    };

    const [asAnalyst, analystRefusal] = await api.decideApproval(pending.approval.id, decision);
    expect([asAnalyst, analystRefusal.error.code]).toEqual([403, 'forbidden']);

    actAs(senior());
    expect((await api.decideApproval(pending.approval.id, decision))[0]).toBe(200);
  });

  it('will not let a senior sign off their own request', async () => {
    const kase = newFlaggedCase('ACC-2004');
    actAs(senior());
    const [, opened] = await api.claim(kase.id, kase.version);
    const [, sent] = await api.requestApproval(kase.id, {
      expectedVersion: opened.case.version,
      recommendedResolution: 'confirm_fraud',
      requesterReason: 'Second pair of eyes, please.',
    });

    const [status, refusal] = await api.decideApproval(sent.approval.id, {
      decision: 'approve',
      reason: 'Approving my own request.',
      expectedApprovalVersion: sent.approval.version,
      expectedCaseVersion: sent.case.version,
    });

    expect([status, refusal.error.code]).toEqual([403, 'forbidden']);
    expect(refusal.error.message).toContain('own approval request');
  });

  it('requires an unassigned case to be claimed before it is worked', async () => {
    const [status, refusal] = await api.decide(CASE_IDS.clear, {
      expectedVersion: 1,
      resolution: 'approved',
      rationale: 'Closing without opening it.',
    });

    expect([status, refusal.error.code]).toEqual([403, 'forbidden']);
    expect(refusal.error.message).toContain('assigned');
  });
});

describe('reasons', () => {
  it('will not close a case or decide an approval without one, and writes nothing', async () => {
    await api.claim(CASE_IDS.clear, 1);
    const pending = await pendingApproval();
    const [, escalatedCase] = await api.case(pending.case.id);
    const events = auditCount();

    const [noRationale, first] = await api.decide(CASE_IDS.clear, {
      expectedVersion: 2,
      resolution: 'approved',
      rationale: '   ',
    });

    actAs(senior());
    const [noReason, second] = await api.decideApproval(pending.approval.id, {
      decision: 'approve',
      reason: '',
      expectedApprovalVersion: pending.approval.version,
      expectedCaseVersion: escalatedCase.case.version,
    });

    expect([noRationale, noReason]).toEqual([400, 400]);
    expect([first.error.code, second.error.code]).toEqual(['invalid_input', 'invalid_input']);
    expect(auditCount()).toBe(events);
  });
});

describe('audit trail', () => {
  it('records the acting user on every hop, keeps ingestion authorless, and cannot be rewritten', async () => {
    const [, opened] = await api.claim(CASE_IDS.clear, 1);
    await api.decide(CASE_IDS.clear, {
      expectedVersion: opened.case.version,
      resolution: 'approved',
      rationale: 'Ordinary account activity.',
    });

    const [, detail] = await api.case(CASE_IDS.clear);
    const [ingestion, ...human] = detail.auditEvents;

    expect([ingestion.action, ingestion.actorId, ingestion.actor]).toEqual([
      'case_created',
      null,
      null,
    ]);
    expect(human.every((event: Json) => event.actor.id === analyst().id)).toBe(true);
    expect(human.map((event: Json) => event.action)).toEqual([
      'open',
      'approve',
      'account_status_change',
    ]);

    // Not even direct SQL can revise the trail: the triggers are the enforcement.
    expect(() => sqlite().prepare(`UPDATE audit_events SET action = 'nothing'`).run()).toThrow(
      /append-only/i,
    );
    expect(() => sqlite().prepare('DELETE FROM audit_events').run()).toThrow(/append-only/i);
  });
});

describe('policy', () => {
  it('is the policy the cases were scored against, and decides their senior gate', async () => {
    const [status, body] = await api.policy();
    expect(status).toBe(200);
    expect(body.policy.escalationThreshold).toBe(60);

    const stamp = policyStamp(body.policy);
    const threshold = body.policy.escalationThreshold;
    const [, queue] = await api.cases();

    expect(queue.cases.every((row: Json) => row.case.policyVersion === stamp)).toBe(true);
    const disagreeing = queue.cases.filter(
      (row: Json) => row.case.requiresSenior !== row.case.riskScore >= threshold,
    );
    expect(disagreeing).toEqual([]);
  });
});

describe('queue', () => {
  it('reads riskiest first and follows the work as it moves', async () => {
    const [, all] = await api.cases();
    const scores = all.cases.map((row: Json) => row.case.riskScore);
    expect([...scores].sort((a: number, b: number) => b - a)).toEqual(scores);

    const [, before] = await api.cases('?assignedTo=me&status=in_review');
    await api.claim(CASE_IDS.clear, 1);
    const [, after] = await api.cases('?assignedTo=me&status=in_review');

    expect(after.cases.length).toBe(before.cases.length + 1);
    expect(after.cases.some((row: Json) => row.case.id === CASE_IDS.clear)).toBe(true);
    expect(after.currentUser.id).toBe(analyst().id);
  });
});
