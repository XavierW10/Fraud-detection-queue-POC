import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CASE_IDS } from '@/db/seed-data';
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

const { actAs, analyst, api, newFlaggedCase, senior, start, stop } = harnessFor(app);

beforeEach(start);
afterEach(stop);

/** The audit trail as a reviewer reads it: what happened, to what, by whom. */
async function trail(caseId: string) {
  const [, detail] = await api.case(caseId);
  return detail.auditEvents.map((event: Json) => [
    event.action,
    event.toStatus,
    event.actor?.name ?? 'system',
  ]);
}

describe('below-threshold case', () => {
  it('is claimed and closed by the analyst alone, clearing the account', async () => {
    const [claimed, opened] = await api.claim(CASE_IDS.clear, 1);
    expect([claimed, opened.case.status, opened.case.assignedTo]).toEqual([
      200,
      'in_review',
      analyst().id,
    ]);

    const [resolved, closed] = await api.decide(CASE_IDS.clear, {
      expectedVersion: opened.case.version,
      resolution: 'approved',
      rationale: 'Salary deposits and grocery spend; nothing to investigate.',
    });
    expect(resolved).toBe(200);
    expect(closed.case.status).toBe('approved');
    expect(closed.case.resolvedAt).not.toBeNull();

    const [, detail] = await api.case(CASE_IDS.clear);
    expect(detail.account.status).toBe('cleared');
    expect(await trail(CASE_IDS.clear)).toEqual([
      ['case_created', 'pending', 'system'],
      ['open', 'in_review', 'Xavier Warmerdam'],
      ['approve', 'approved', 'Xavier Warmerdam'],
      ['account_status_change', 'cleared', 'Xavier Warmerdam'],
    ]);
  });
});

describe('above-threshold case', () => {
  it('refuses the analyst a direct close and takes the senior route instead', async () => {
    const kase = newFlaggedCase('ACC-2001');
    const [, opened] = await api.claim(kase.id, kase.version);

    const [refused, refusal] = await api.decide(kase.id, {
      expectedVersion: opened.case.version,
      resolution: 'confirmed_fraud',
      rationale: 'Looks like a mule to me.',
    });
    expect([refused, refusal.error.code]).toEqual([403, 'forbidden']);

    const [escalated, sent] = await api.requestApproval(kase.id, {
      expectedVersion: opened.case.version,
      recommendedResolution: 'confirm_fraud',
      requesterReason: 'Structuring plus impossible travel; recommend confirming fraud.',
    });
    expect([escalated, sent.case.status, sent.approval.status]).toEqual([
      200,
      'escalated',
      'pending',
    ]);

    const [, awaiting] = await api.case(kase.id);
    expect(awaiting.account.status).toBe('under_review');

    actAs(senior());
    const [decided, outcome] = await api.decideApproval(sent.approval.id, {
      decision: 'approve',
      reason: 'Agreed; filing a SAR and closing as fraud.',
      expectedApprovalVersion: sent.approval.version,
      expectedCaseVersion: sent.case.version,
    });
    expect(decided).toBe(200);
    expect([outcome.case.status, outcome.case.resolution]).toEqual(['rejected', 'confirmed_fraud']);
    expect([outcome.approval.status, outcome.approval.decidedBy]).toEqual([
      'approved',
      senior().id,
    ]);

    const [, closed] = await api.case(kase.id);
    expect(closed.account.status).toBe('confirmed_fraud');
    expect(await trail(kase.id)).toEqual([
      ['open', 'in_review', 'Xavier Warmerdam'],
      ['escalate', 'escalated', 'Xavier Warmerdam'],
      ['request_approval', null, 'Xavier Warmerdam'],
      ['account_status_change', 'under_review', 'Xavier Warmerdam'],
      ['reject', 'rejected', 'Jane Doe'],
      ['account_status_change', 'confirmed_fraud', 'Jane Doe'],
    ]);
  });

  it('can be returned to the analyst and escalated a second time', async () => {
    const kase = newFlaggedCase('ACC-2002');
    const [, opened] = await api.claim(kase.id, kase.version);
    const [, first] = await api.requestApproval(kase.id, {
      expectedVersion: opened.case.version,
      recommendedResolution: 'confirm_fraud',
      requesterReason: 'Recommend confirming fraud.',
    });

    actAs(senior());
    const [, returned] = await api.decideApproval(first.approval.id, {
      decision: 'return',
      reason: 'Attach the device linkage evidence before I sign this off.',
      expectedApprovalVersion: first.approval.version,
      expectedCaseVersion: first.case.version,
    });
    expect([returned.case.status, returned.approval.status]).toEqual(['in_review', 'rejected']);

    actAs(analyst());
    const [resent, second] = await api.requestApproval(kase.id, {
      expectedVersion: returned.case.version,
      recommendedResolution: 'confirm_fraud',
      requesterReason: 'Device linkage attached: shared with a known-bad account.',
    });
    expect([resent, second.case.status]).toEqual([200, 'escalated']);

    actAs(senior());
    const [, finished] = await api.decideApproval(second.approval.id, {
      decision: 'approve',
      reason: 'Evidence is sufficient now.',
      expectedApprovalVersion: second.approval.version,
      expectedCaseVersion: second.case.version,
    });
    expect(finished.case.status).toBe('rejected');

    // Both rounds survive: the returned request is not overwritten by the second.
    const [, history] = await api.approvals(`?caseId=${kase.id}`);
    expect(history.approvals.map((row: Json) => row.approval.status)).toEqual([
      'rejected',
      'approved',
    ]);
  });

  it('may be closed directly by a senior who holds it', async () => {
    const kase = newFlaggedCase('ACC-2003');

    actAs(senior());
    const [, opened] = await api.claim(kase.id, kase.version);
    const [status, closed] = await api.decide(kase.id, {
      expectedVersion: opened.case.version,
      resolution: 'confirmed_fraud',
      rationale: 'Reviewed with the AML team; no second signature needed.',
    });

    expect([status, closed.case.status, closed.case.resolution]).toEqual([
      200,
      'rejected',
      'confirmed_fraud',
    ]);
    // No approval request was needed, so only the two seeded ones exist.
    const [, all] = await api.approvals();
    expect(all.approvals).toHaveLength(2);
  });
});

describe('closed case', () => {
  it('refuses every further action', async () => {
    const closed = CASE_IDS.geo; // approved by the analyst in the seed, at version 3
    const before = await trail(closed);

    const attempts = [
      await api.claim(closed, 3),
      await api.decide(closed, { expectedVersion: 3, resolution: 'rejected', rationale: 'No.' }),
      await api.requestApproval(closed, {
        expectedVersion: 3,
        recommendedResolution: 'reject',
        requesterReason: 'Second thoughts.',
      }),
    ];

    expect(attempts.map(([status]) => status)).toEqual([403, 422, 403]);
    expect(await trail(closed)).toEqual(before);
  });
});
