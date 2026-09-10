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
 * Loads the fixed demo dataset. Idempotent: every row has a literal id and is
 * upserted, so running the seed twice leaves the same rows rather than
 * duplicating them. `audit_events` is append-only, so existing rows are left
 * alone instead of being rewritten.
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
      ...seedCase,
      riskScore: evaluation.riskScore,
      triggeredRules: evaluation.triggeredRules,
      requiresSenior: requiresSenior(evaluation.riskScore, policy),
      policyVersion: policyStamp(policy),
    };
    db.insert(cases).values(values).onConflictDoUpdate({ target: cases.id, set: values }).run();
  }

  for (const approval of seedApprovals) {
    db.insert(approvals)
      .values(approval)
      .onConflictDoUpdate({ target: approvals.id, set: approval })
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
