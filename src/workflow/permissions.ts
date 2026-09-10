import type { Approval, Case, User } from '@/db/schema';
import { WorkflowError } from './errors';

export type WorkflowAction = 'claim' | 'resolve' | 'request_approval' | 'decide_approval';

export type PermissionContext = {
  actor: User;
  case: Pick<Case, 'assignedTo' | 'requiresSenior'>;
  approval?: Pick<Approval, 'requestedBy'>;
};

/**
 * The single place role rules live. Each check returns the refusal reason, or
 * null when the action is allowed; workflow state is enforced separately by the
 * transition table, so these only answer "may this user do this at all".
 */
const RULES: Record<WorkflowAction, (context: PermissionContext) => string | null> = {
  claim: ({ case: kase }) =>
    kase.assignedTo === null ? null : 'Case is already assigned to another reviewer',

  resolve: ({ actor, case: kase }) => {
    if (kase.assignedTo !== actor.id) return 'Only the assigned reviewer can resolve a case';
    if (kase.requiresSenior && actor.role !== 'senior') {
      return 'Flagged cases require senior approval and cannot be resolved directly';
    }
    return null;
  },

  request_approval: ({ actor, case: kase }) => {
    if (kase.assignedTo !== actor.id) return 'Only the assigned reviewer can request approval';
    if (!kase.requiresSenior) return 'Case is below the threshold and can be resolved directly';
    return null;
  },

  decide_approval: ({ actor, approval }) => {
    if (actor.role !== 'senior') return 'Only a senior can decide an approval request';
    if (approval && approval.requestedBy === actor.id) {
      return 'A senior cannot decide their own approval request';
    }
    return null;
  },
};

export function permits(action: WorkflowAction, context: PermissionContext): boolean {
  return RULES[action](context) === null;
}

export function assertPermitted(action: WorkflowAction, context: PermissionContext): void {
  const refusal = RULES[action](context);
  if (refusal) throw new WorkflowError('forbidden', refusal);
}
