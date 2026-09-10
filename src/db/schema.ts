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

const now = sql`(unixepoch())`;

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull(),
  role: text('role', { enum: USER_ROLES }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now),
});

export const accounts = sqliteTable('accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  externalRef: text('external_ref').notNull(),
  status: text('status', { enum: ACCOUNT_STATUSES }).notNull().default('clear'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now),
});

export const transactions = sqliteTable('transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id')
    .notNull()
    .references(() => accounts.id),
  amount: real('amount').notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
  latitude: real('latitude').notNull(),
  longitude: real('longitude').notNull(),
  deviceId: text('device_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now),
});

export const cases = sqliteTable('cases', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accountId: integer('account_id')
    .notNull()
    .references(() => accounts.id),
  assignedTo: integer('assigned_to').references(() => users.id),
  lockedBy: integer('locked_by').references(() => users.id),
  lockedAt: integer('locked_at', { mode: 'timestamp' }),
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
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(now),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
  version: integer('version').notNull().default(1),
});

export const approvals = sqliteTable('approvals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  caseId: integer('case_id')
    .notNull()
    .references(() => cases.id),
  recommendedResolution: text('recommended_resolution', {
    enum: RECOMMENDED_RESOLUTIONS,
  }).notNull(),
  requesterReason: text('requester_reason').notNull(),
  seniorDecisionReason: text('senior_decision_reason'),
  status: text('status', { enum: APPROVAL_STATUSES }).notNull().default('pending'),
  requestedBy: integer('requested_by')
    .notNull()
    .references(() => users.id),
  decidedBy: integer('decided_by').references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(now),
  decidedAt: integer('decided_at', { mode: 'timestamp' }),
  version: integer('version').notNull().default(1),
});

/**
 * Append-only audit trail. Rows are immutable after insert: there are no
 * mutable columns and DB triggers abort any UPDATE or DELETE.
 */
export const auditEvents = sqliteTable('audit_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  caseId: integer('case_id')
    .notNull()
    .references(() => cases.id),
  actorId: integer('actor_id').references(() => users.id),
  action: text('action').notNull(),
  fromStatus: text('from_status'),
  toStatus: text('to_status'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(now),
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
