import { sql } from 'drizzle-orm';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const USER_ROLES = ['reviewer', 'senior'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ACCOUNT_STATUSES = [
  'clear',
  'flagged',
  'under_review',
  'confirmed_fraud',
  'cleared',
] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const CASE_STATUSES = ['pending', 'in_review', 'escalated', 'approved', 'rejected'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_RESOLUTIONS = ['approved', 'rejected', 'confirmed_fraud'] as const;
export type CaseResolution = (typeof CASE_RESOLUTIONS)[number];

export const RECOMMENDED_RESOLUTIONS = ['approve', 'reject', 'confirm_fraud'] as const;
export type RecommendedResolution = (typeof RECOMMENDED_RESOLUTIONS)[number];

export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

const now = sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`;

const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });

const uuid = (name: string) =>
  text(name)
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

export const users = sqliteTable('users', {
  id: uuid('id'),
  email: text('email').notNull(),
  role: text('role', { enum: USER_ROLES }).notNull(),
  createdAt: timestamp('created_at').notNull().default(now),
});

export const accounts = sqliteTable('accounts', {
  id: uuid('id'),
  externalRef: text('external_ref').notNull(),
  status: text('status', { enum: ACCOUNT_STATUSES }).notNull().default('clear'),
  createdAt: timestamp('created_at').notNull().default(now),
});

export const transactions = sqliteTable('transactions', {
  id: uuid('id'),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id),
  amount: real('amount').notNull(),
  timestamp: timestamp('timestamp').notNull(),
  latitude: real('latitude').notNull(),
  longitude: real('longitude').notNull(),
  deviceId: text('device_id').notNull(),
  createdAt: timestamp('created_at').notNull().default(now),
});

export const cases = sqliteTable('cases', {
  id: uuid('id'),
  accountId: text('account_id')
    .notNull()
    .references(() => accounts.id),
  assignedTo: text('assigned_to').references(() => users.id),
  lockedBy: text('locked_by').references(() => users.id),
  lockedAt: timestamp('locked_at'),
  status: text('status', { enum: CASE_STATUSES }).notNull().default('pending'),
  riskScore: real('risk_score').notNull().default(0),
  requiresSenior: integer('requires_senior', { mode: 'boolean' }).notNull().default(false),
  triggeredRules: text('triggered_rules', { mode: 'json' })
    .notNull()
    .$type<TriggeredRule[]>()
    .default(sql`'[]'`),
  policyVersion: text('policy_version').notNull(),
  resolution: text('resolution', { enum: CASE_RESOLUTIONS }),
  rationale: text('rationale'),
  createdAt: timestamp('created_at').notNull().default(now),
  updatedAt: timestamp('updated_at').notNull().default(now),
  resolvedAt: timestamp('resolved_at'),
  version: integer('version').notNull().default(1),
});

export const approvals = sqliteTable('approvals', {
  id: uuid('id'),
  caseId: text('case_id')
    .notNull()
    .references(() => cases.id),
  recommendedResolution: text('recommended_resolution', {
    enum: RECOMMENDED_RESOLUTIONS,
  }).notNull(),
  requesterReason: text('requester_reason').notNull(),
  seniorDecisionReason: text('senior_decision_reason'),
  status: text('status', { enum: APPROVAL_STATUSES }).notNull().default('pending'),
  requestedBy: text('requested_by')
    .notNull()
    .references(() => users.id),
  decidedBy: text('decided_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().default(now),
  updatedAt: timestamp('updated_at').notNull().default(now),
  decidedAt: timestamp('decided_at'),
  version: integer('version').notNull().default(1),
});

/**
 * Append-only audit trail. Rows are immutable after insert: there are no
 * mutable columns and DB triggers abort any UPDATE or DELETE.
 */
export const auditEvents = sqliteTable('audit_events', {
  id: uuid('id'),
  caseId: text('case_id')
    .notNull()
    .references(() => cases.id),
  actorId: text('actor_id').references(() => users.id),
  action: text('action').notNull(),
  fromStatus: text('from_status'),
  toStatus: text('to_status'),
  /** Millisecond precision so the append-only trail has a stable read order. */
  createdAt: timestamp('created_at').notNull().default(now),
});

export type TriggeredRule = {
  id: string;
  triggered: boolean;
  weight: number;
  reason: string;
};

export type User = typeof users.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Case = typeof cases.$inferSelect;
export type Approval = typeof approvals.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
