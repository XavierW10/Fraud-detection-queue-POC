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

  const riskScore = triggeredRules
    .filter((outcome) => outcome.triggered)
    .reduce((total, outcome) => total + outcome.weight, 0);

  return { riskScore, triggeredRules };
}

export function requiresSenior(riskScore: number, policy: Policy): boolean {
  return riskScore >= policy.escalationThreshold;
}
