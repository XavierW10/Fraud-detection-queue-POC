import { and, asc, count, desc, eq, type SQL } from 'drizzle-orm';
import { listAuditEventsForCase } from '@/db/audit';
import type { DbLike } from '@/db/client';
import {
  accounts,
  approvals,
  cases,
  transactions,
  users,
  type ApprovalStatus,
  type CaseStatus,
} from '@/db/schema';
import { WorkflowError } from './errors';

/** The queue read model: the case plus the account it is about and its owner. */
const caseColumns = {
  case: cases,
  account: { id: accounts.id, externalRef: accounts.externalRef, status: accounts.status },
  assignee: { id: users.id, name: users.name, role: users.role },
};

export type CaseFilter = {
  status?: CaseStatus;
  assignedTo?: string;
  requiresSenior?: boolean;
};

/** A page of the queue is returned with the unpaged total, so the UI can show "n of m". */
export function listCases(db: DbLike, filter: CaseFilter = {}, page = { limit: 50, offset: 0 }) {
  const conditions: SQL[] = [];
  if (filter.status) conditions.push(eq(cases.status, filter.status));
  if (filter.assignedTo) conditions.push(eq(cases.assignedTo, filter.assignedTo));
  if (filter.requiresSenior !== undefined) {
    conditions.push(eq(cases.requiresSenior, filter.requiresSenior));
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const rows = db
    .select(caseColumns)
    .from(cases)
    .innerJoin(accounts, eq(cases.accountId, accounts.id))
    .leftJoin(users, eq(cases.assignedTo, users.id))
    .where(where)
    // Riskiest first, then oldest, then by id so paging never repeats or skips a row.
    .orderBy(desc(cases.riskScore), asc(cases.createdAt), asc(cases.id))
    .limit(page.limit)
    .offset(page.offset)
    .all();

  const total = db.select({ value: count() }).from(cases).where(where).get()?.value ?? 0;

  return { cases: rows, page: { ...page, total } };
}

/** Everything the case detail view shows, in one read. */
export function getCaseDetail(db: DbLike, caseId: string) {
  const row = db
    .select(caseColumns)
    .from(cases)
    .innerJoin(accounts, eq(cases.accountId, accounts.id))
    .leftJoin(users, eq(cases.assignedTo, users.id))
    .where(eq(cases.id, caseId))
    .get();
  if (!row) throw new WorkflowError('not_found', `No case ${caseId}`);

  return {
    ...row,
    transactions: db
      .select()
      .from(transactions)
      .where(eq(transactions.accountId, row.account.id))
      .orderBy(asc(transactions.timestamp))
      .all(),
    approvals: listApprovals(db, { caseId }),
    auditEvents: listAuditEventsForCase(db, caseId),
  };
}

export type ApprovalFilter = { status?: ApprovalStatus; caseId?: string };

export function listApprovals(db: DbLike, filter: ApprovalFilter = {}) {
  const conditions: SQL[] = [];
  if (filter.status) conditions.push(eq(approvals.status, filter.status));
  if (filter.caseId) conditions.push(eq(approvals.caseId, filter.caseId));

  return db
    .select({
      approval: approvals,
      case: {
        id: cases.id,
        status: cases.status,
        riskScore: cases.riskScore,
        requiresSenior: cases.requiresSenior,
        triggeredRules: cases.triggeredRules,
        assignedTo: cases.assignedTo,
        version: cases.version,
      },
      account: { id: accounts.id, externalRef: accounts.externalRef },
      requester: { id: users.id, name: users.name },
    })
    .from(approvals)
    .innerJoin(cases, eq(approvals.caseId, cases.id))
    .innerJoin(accounts, eq(cases.accountId, accounts.id))
    .innerJoin(users, eq(approvals.requestedBy, users.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(approvals.createdAt))
    .all();
}
