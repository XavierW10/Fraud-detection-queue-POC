import type { AccountStatus, TriggeredRule } from '@/db/schema';

/** The transaction fields the rules evaluate. */
export type EvaluatedTransaction = {
  id: string;
  accountId: string;
  amount: number;
  timestamp: Date;
  latitude: number;
  longitude: number;
  deviceId: string;
};

/** A device seen on another account, with that account's stored status. */
export type DeviceLink = {
  deviceId: string;
  accountId: string;
  accountStatus: AccountStatus;
};

/**
 * Everything a rule may read. Passed in explicitly so rules stay pure: they
 * never query the database and never mutate account state.
 */
export type EvaluationInput = {
  accountId: string;
  transactions: EvaluatedTransaction[];
  /** Device usage on accounts other than `accountId`. */
  deviceLinks: DeviceLink[];
};

export type RuleOutcome = TriggeredRule;

export type Evaluation = {
  riskScore: number;
  triggeredRules: RuleOutcome[];
};

export const RULE_IDS = {
  structuring: 'structuring',
  geoImpossibility: 'geo_impossibility',
  sharedDeviceLinkage: 'shared_device_linkage',
} as const;

export function byTimestamp(a: EvaluatedTransaction, b: EvaluatedTransaction): number {
  return a.timestamp.getTime() - b.timestamp.getTime();
}
