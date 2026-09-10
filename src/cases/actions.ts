import type { CaseStatus, UserRole } from '@/db/schema';
import { isClosed } from '@/workflow/transitions';

/**
 * What the UI may offer. The server still decides every one of these — this
 * only keeps a reviewer from being shown a button that would be refused.
 */
export type CaseActionId =
  'claim' | 'clear' | 'confirm' | 'request_approval' | 'approve_request' | 'return_request';

export type ActionContext = {
  actor: { id: string; role: UserRole };
  case: { status: CaseStatus; assignedTo: string | null; requiresSenior: boolean };
  /** The outstanding request, when the case is awaiting approval. */
  pendingApproval?: { requestedBy: string } | null;
};

export function availableActions({
  actor,
  case: kase,
  pendingApproval,
}: ActionContext): CaseActionId[] {
  if (isClosed(kase.status)) return [];

  if (kase.status === 'pending') return kase.assignedTo === null ? ['claim'] : [];

  // Awaiting approval: the requester waits, and only another senior can decide.
  if (kase.status === 'escalated') {
    if (!pendingApproval || actor.role !== 'senior') return [];
    return pendingApproval.requestedBy === actor.id ? [] : ['approve_request', 'return_request'];
  }

  if (kase.assignedTo !== actor.id) return [];

  // A flagged case is the analyst's to escalate and the senior's to close.
  if (kase.requiresSenior && actor.role !== 'senior') return ['request_approval'];
  return ['clear', 'confirm'];
}

/** Why the case offers nothing, so a read-only view says so instead of looking broken. */
export function readOnlyReason(context: ActionContext): string | null {
  if (availableActions(context).length > 0) return null;

  const { actor, case: kase, pendingApproval } = context;
  if (isClosed(kase.status)) return 'This case is closed and cannot change.';
  if (kase.status === 'escalated') {
    return pendingApproval?.requestedBy === actor.id
      ? 'Waiting on a senior decision for the approval you requested.'
      : 'Waiting on a Senior Fraud Analyst to decide the approval request.';
  }
  if (kase.assignedTo !== null && kase.assignedTo !== actor.id) {
    return 'This case is assigned to another analyst.';
  }
  return 'No actions are available to you on this case.';
}
