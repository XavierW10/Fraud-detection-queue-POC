import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { DbLike } from '@/db/client';
import {
  accounts,
  approvals,
  auditEvents,
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

export function listCases(db: DbLike, filter: CaseFilter = {}) {
  const conditions: SQL[] = [];
  if (filter.status) conditions.push(eq(cases.status, filter.status));
  if (filter.assignedTo) conditions.push(eq(cases.assignedTo, filter.assignedTo));
  if (filter.requiresSenior !== undefined) {
    conditions.push(eq(cases.requiresSenior, filter.requiresSenior));
  }

  return (
    db
      .select(caseColumns)
      .from(cases)
      .innerJoin(accounts, eq(cases.accountId, accounts.id))
      .leftJoin(users, eq(cases.assignedTo, users.id))
      .where(conditions.length ? and(...conditions) : undefined)
      // Riskiest first, then oldest, so the queue reads top-down.
      .orderBy(desc(cases.riskScore), asc(cases.createdAt))
      .all()
  );
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
    auditEvents: db
      .select({ event: auditEvents, actor: { id: users.id, name: users.name } })
      .from(auditEvents)
      .leftJoin(users, eq(auditEvents.actorId, users.id))
      .where(eq(auditEvents.caseId, caseId))
      // Insertion order: UUIDs do not sort chronologically.
      .orderBy(sql`${auditEvents}.rowid`)
      .all()
      // A null actor is a system event, and stays null rather than becoming a user.
      .map(({ event, actor }) => ({ ...event, actor })),
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
      case: { id: cases.id, status: cases.status, riskScore: cases.riskScore },
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
