import { describe, expect, it } from 'vitest';
import { availableActions, readOnlyReason, type ActionContext } from '@/cases/actions';
import type { CaseStatus } from '@/db/schema';

const XAVIER = { id: 'user-analyst', role: 'reviewer' } as const;
const JANE = { id: 'user-senior', role: 'senior' } as const;

function context(
  actor: ActionContext['actor'],
  kase: Partial<ActionContext['case']> & { status: CaseStatus },
  pendingApproval: ActionContext['pendingApproval'] = null,
): ActionContext {
  return {
    actor,
    case: { assignedTo: null, requiresSenior: false, ...kase },
    pendingApproval,
  };
}

describe('available case actions', () => {
  it('offers an unassigned pending case to either persona', () => {
    const unassigned = { status: 'pending' } as const;
    expect(availableActions(context(XAVIER, unassigned))).toEqual(['claim']);
    expect(availableActions(context(JANE, unassigned))).toEqual(['claim']);
  });

  it('lets the analyst resolve their own below-threshold case directly', () => {
    const actions = availableActions(
      context(XAVIER, { status: 'in_review', assignedTo: XAVIER.id }),
    );
    expect(actions).toEqual(['clear', 'confirm']);
  });

  it('replaces direct resolution with escalation when the analyst holds a flagged case', () => {
    const actions = availableActions(
      context(XAVIER, { status: 'in_review', assignedTo: XAVIER.id, requiresSenior: true }),
    );
    expect(actions).toEqual(['request_approval']);
  });

  it('lets the senior resolve a case they hold, flagged or not', () => {
    const flagged = context(JANE, {
      status: 'in_review',
      assignedTo: JANE.id,
      requiresSenior: true,
    });
    expect(availableActions(flagged)).toEqual(['clear', 'confirm']);
    expect(availableActions(context(JANE, { status: 'in_review', assignedTo: JANE.id }))).toEqual([
      'clear',
      'confirm',
    ]);
  });

  it('is read-only for everyone but the assignee', () => {
    const someoneElses = context(XAVIER, { status: 'in_review', assignedTo: JANE.id });
    expect(availableActions(someoneElses)).toEqual([]);
    expect(readOnlyReason(someoneElses)).toMatch(/another analyst/);
  });

  it('is read-only for the requester while the case awaits approval', () => {
    const waiting = context(
      XAVIER,
      { status: 'escalated', assignedTo: XAVIER.id, requiresSenior: true },
      { requestedBy: XAVIER.id },
    );
    expect(availableActions(waiting)).toEqual([]);
    expect(readOnlyReason(waiting)).toMatch(/senior decision/);
  });

  it('offers approve and return to a senior who did not raise the request', () => {
    const request = { status: 'escalated', assignedTo: XAVIER.id, requiresSenior: true } as const;
    expect(availableActions(context(JANE, request, { requestedBy: XAVIER.id }))).toEqual([
      'approve_request',
      'return_request',
    ]);
    // Separation of duties: a senior may not decide their own request.
    expect(availableActions(context(JANE, request, { requestedBy: JANE.id }))).toEqual([]);
  });

  it('offers nothing on a closed case, whoever is looking', () => {
    for (const status of ['approved', 'rejected'] as const) {
      const closed = context(JANE, { status, assignedTo: JANE.id });
      expect(availableActions(closed)).toEqual([]);
      expect(readOnlyReason(closed)).toMatch(/closed/);
    }
  });
});
