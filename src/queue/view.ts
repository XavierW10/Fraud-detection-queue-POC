import type { CaseStatus } from '@/db/schema';

/** One queue row, flattened and pre-formatted so the table stays presentational. */
export type QueueRow = {
  id: string;
  reference: string;
  accountRef: string;
  riskScore: number;
  /** Over the policy threshold — the case needs a senior, whatever the account's status says. */
  flagged: boolean;
  rules: string[];
  status: CaseStatus;
  open: boolean;
  assigneeId: string | null;
  assigneeName: string | null;
  createdAt: string;
  version: number;
};

/** Open and closed sit alongside the individual statuses: reviewers ask for both. */
export type StatusFilter = CaseStatus | 'all' | 'open' | 'closed';
export type FlagFilter = 'all' | 'flagged' | 'unflagged';
export type AssignmentFilter = 'all' | 'mine' | 'unassigned';

export type QueueFilters = {
  status: StatusFilter;
  flag: FlagFilter;
  rule: string;
  assignment: AssignmentFilter;
  minRisk: number;
};

export const NO_FILTERS: QueueFilters = {
  status: 'all',
  flag: 'all',
  rule: 'all',
  assignment: 'all',
  minRisk: 0,
};

export type QueueSummary = {
  open: number;
  flagged: number;
  awaitingApproval: number;
  unassigned: number;
};

export function summarize(rows: QueueRow[]): QueueSummary {
  return {
    open: rows.filter((row) => row.open).length,
    flagged: rows.filter((row) => row.flagged).length,
    awaitingApproval: rows.filter((row) => row.status === 'escalated').length,
    unassigned: rows.filter((row) => row.assigneeId === null).length,
  };
}

/**
 * Work first: open cases above closed ones, flagged above unflagged, riskiest
 * first, and the oldest case first when those tie — so the top row is always
 * the one that has been waiting longest at the highest risk.
 */
export function byPriority(a: QueueRow, b: QueueRow): number {
  return (
    Number(b.open) - Number(a.open) ||
    Number(b.flagged) - Number(a.flagged) ||
    b.riskScore - a.riskScore ||
    a.createdAt.localeCompare(b.createdAt)
  );
}

export function filterAndSort(
  rows: QueueRow[],
  filters: QueueFilters,
  currentUserId: string,
): QueueRow[] {
  return rows.filter((row) => matches(row, filters, currentUserId)).sort(byPriority);
}

function matches(row: QueueRow, filters: QueueFilters, currentUserId: string): boolean {
  return (
    matchesStatus(row, filters.status) &&
    (filters.flag === 'all' || row.flagged === (filters.flag === 'flagged')) &&
    (filters.rule === 'all' || row.rules.includes(filters.rule)) &&
    matchesAssignment(row, filters.assignment, currentUserId) &&
    row.riskScore >= filters.minRisk
  );
}

function matchesStatus(row: QueueRow, status: StatusFilter): boolean {
  if (status === 'all') return true;
  if (status === 'open') return row.open;
  if (status === 'closed') return !row.open;
  return row.status === status;
}

function matchesAssignment(
  row: QueueRow,
  assignment: AssignmentFilter,
  currentUserId: string,
): boolean {
  if (assignment === 'all') return true;
  if (assignment === 'mine') return row.assigneeId === currentUserId;
  return row.assigneeId === null;
}
