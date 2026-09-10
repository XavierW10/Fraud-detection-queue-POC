import type { CaseStatus } from '@/db/schema';
import { WorkflowError } from './errors';

/**
 * The case state machine. `escalated` is the "awaiting approval" state: a case
 * only enters it when a reviewer requests senior sign-off, and a senior either
 * closes it or sends it back to `in_review`.
 */
export const CASE_TRANSITIONS: Record<CaseStatus, readonly CaseStatus[]> = {
  pending: ['in_review'],
  in_review: ['escalated', 'approved', 'rejected'],
  escalated: ['in_review', 'approved', 'rejected'],
  approved: [],
  rejected: [],
};

export function isClosed(status: CaseStatus): boolean {
  return CASE_TRANSITIONS[status].length === 0;
}

export function canTransition(from: CaseStatus, to: CaseStatus): boolean {
  return CASE_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: CaseStatus, to: CaseStatus): void {
  if (canTransition(from, to)) return;
  throw new WorkflowError(
    'invalid_transition',
    isClosed(from)
      ? `Case is closed as ${from} and cannot transition again`
      : `Cannot move a case from ${from} to ${to}`,
  );
}
