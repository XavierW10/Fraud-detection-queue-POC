import { loadPolicy } from '@/policy/load';
import { policyStamp } from '@/policy/schema';
import { evaluateAccount, requiresSenior } from '@/rules/engine';
import type { DeviceLink, EvaluationInput } from '@/rules/types';
import type { Db } from './client';
import {
  seedAccounts,
  seedApprovals,
  seedAuditEvents,
  seedCases,
  seedTransactions,
  seedUsers,
} from './seed-data';
import { accounts, approvals, auditEvents, cases, transactions, users } from './schema';

/**
 * Columns the workflow writes but a seed row may omit. An upsert only sets the
 * keys it is given, so without these an already-worked case would keep the
 * assignee or resolution the demo gave it and re-seeding would not restore the
 * starting state.
 */
const CASE_DEFAULTS = {
  assignedTo: null,
  lockedBy: null,
  lockedAt: null,
  resolution: null,
  rationale: null,
  resolvedAt: null,
} as const;

const APPROVAL_DEFAULTS = {
  seniorDecisionReason: null,
  decidedBy: null,
  decidedAt: null,
} as const;

/**
 * Loads the fixed demo dataset. Idempotent: every row has a literal id and is
 * upserted, so running the seed twice leaves the same rows rather than
 * duplicating them, and a case or approval the demo has moved on is restored
 * to its seeded state. `audit_events` is append-only, so existing rows are
 * left alone instead of being rewritten — including any the demo added, which
 * `npm run db:reset` clears by rebuilding the database.
 */
export function seedDatabase(db: Db) {
  const policy = loadPolicy();

  for (const user of seedUsers) {
    db.insert(users).values(user).onConflictDoUpdate({ target: users.id, set: user }).run();
  }

  for (const account of seedAccounts) {
    db.insert(accounts)
      .values(account)
      .onConflictDoUpdate({ target: accounts.id, set: account })
      .run();
  }

  for (const transaction of seedTransactions) {
    db.insert(transactions)
      .values(transaction)
      .onConflictDoUpdate({ target: transactions.id, set: transaction })
      .run();
  }

  const evaluations = new Map(
    seedAccounts.map((account) => [
      account.id,
      evaluateAccount(evaluationInputFor(account.id), policy),
    ]),
  );

  for (const seedCase of seedCases) {
    const evaluation = evaluations.get(seedCase.accountId);
    if (!evaluation) throw new Error(`No evaluation for account ${seedCase.accountId}`);

    const values = {
      ...CASE_DEFAULTS,
      ...seedCase,
      riskScore: evaluation.riskScore,
      triggeredRules: evaluation.triggeredRules,
      requiresSenior: requiresSenior(evaluation.riskScore, policy),
      policyVersion: policyStamp(policy),
    };
    db.insert(cases).values(values).onConflictDoUpdate({ target: cases.id, set: values }).run();
  }

  for (const seedApproval of seedApprovals) {
    const values = { ...APPROVAL_DEFAULTS, ...seedApproval };
    db.insert(approvals)
      .values(values)
      .onConflictDoUpdate({ target: approvals.id, set: values })
      .run();
  }

  // Append-only: never rewrite an audit row that is already there.
  db.insert(auditEvents).values(seedAuditEvents).onConflictDoNothing().run();
}

/** Device usage on every account other than `accountId`, as the rules expect. */
function evaluationInputFor(accountId: string): EvaluationInput {
  const statuses = new Map(seedAccounts.map((account) => [account.id, account.status]));
  const deviceLinks: DeviceLink[] = seedTransactions
    .filter((tx) => tx.accountId !== accountId)
    .map((tx) => {
      const accountStatus = statuses.get(tx.accountId);
      if (!accountStatus) throw new Error(`Transaction ${tx.id} has no seeded account`);
      return { deviceId: tx.deviceId, accountId: tx.accountId, accountStatus };
    });

  return {
    accountId,
    transactions: seedTransactions.filter((tx) => tx.accountId === accountId),
    deviceLinks,
  };
}
