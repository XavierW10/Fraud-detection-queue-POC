import type { StructuringRule } from '@/policy/schema';
import {
  asEvidence,
  byTimestamp,
  RULE_IDS,
  type EvaluatedTransaction,
  type EvaluationInput,
  type RuleOutcome,
} from './types';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Structuring: at least `minTransactions` transactions on the account, each
 * within [minAmount, maxAmount], all inside an inclusive `windowHours` window.
 * The first qualifying window is retained as evidence.
 */
export function structuringRule(input: EvaluationInput, rule: StructuringRule): RuleOutcome {
  const id = RULE_IDS.structuring;
  if (!rule.enabled) {
    return { id, triggered: false, weight: 0, reason: 'Rule disabled' };
  }

  const candidates = input.transactions
    .filter((tx) => tx.amount >= rule.minAmount && tx.amount <= rule.maxAmount)
    .sort(byTimestamp);

  const window = firstQualifyingWindow(candidates, rule);
  if (!window) {
    return {
      id,
      triggered: false,
      weight: 0,
      reason: `Fewer than ${rule.minTransactions} transactions between ${rule.minAmount} and ${rule.maxAmount} within ${rule.windowHours}h`,
    };
  }

  const spanHours = round(
    (last(window).timestamp.getTime() - window[0].timestamp.getTime()) / HOUR_MS,
  );
  return {
    id,
    triggered: true,
    weight: rule.weight,
    reason: `${window.length} transactions between ${rule.minAmount} and ${rule.maxAmount} within ${spanHours}h (${window[0].timestamp.toISOString()} - ${last(window).timestamp.toISOString()}): ${window.map((tx) => tx.amount).join(', ')}`,
    evidence: {
      kind: 'structuring',
      transactions: window.map(asEvidence),
      windowStart: window[0].timestamp.toISOString(),
      windowEnd: last(window).timestamp.toISOString(),
      spanHours,
    },
  };
}

function firstQualifyingWindow(
  candidates: EvaluatedTransaction[],
  rule: StructuringRule,
): EvaluatedTransaction[] | null {
  const windowMs = rule.windowHours * HOUR_MS;
  for (let start = 0; start <= candidates.length - rule.minTransactions; start++) {
    let end = start;
    while (
      end + 1 < candidates.length &&
      candidates[end + 1].timestamp.getTime() - candidates[start].timestamp.getTime() <= windowMs
    ) {
      end++;
    }
    if (end - start + 1 >= rule.minTransactions) {
      return candidates.slice(start, end + 1);
    }
  }
  return null;
}

function last<T>(items: T[]): T {
  return items[items.length - 1];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
