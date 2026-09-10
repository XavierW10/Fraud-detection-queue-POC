import type { Policy } from '@/policy/schema';
import { geoImpossibilityRule } from './geoImpossibility';
import { sharedDeviceLinkageRule } from './sharedDeviceLinkage';
import { structuringRule } from './structuring';
import type { Evaluation, EvaluationInput } from './types';

/**
 * Runs every rule over an account's transactions. Pure and side-effect free:
 * the caller persists only the outcome (riskScore, triggeredRules, policyVersion).
 */
export function evaluateAccount(input: EvaluationInput, policy: Policy): Evaluation {
  const triggeredRules = [
    structuringRule(input, policy.rules.structuring),
    geoImpossibilityRule(input, policy.rules.geoImpossibility),
    sharedDeviceLinkageRule(input, policy.rules.sharedDeviceLinkage),
  ];

  // Keyed by rule id so a rule contributes its weight at most once, however
  // many times it matched within the account's transactions.
  const scored = new Map(
    triggeredRules.filter((outcome) => outcome.triggered).map((outcome) => [outcome.id, outcome]),
  );
  const riskScore = [...scored.values()].reduce((total, outcome) => total + outcome.weight, 0);

  return { riskScore, triggeredRules };
}

/** An account is flagged for senior review at or above the policy threshold. */
export function requiresSenior(riskScore: number, policy: Policy): boolean {
  return riskScore >= policy.escalationThreshold;
}
