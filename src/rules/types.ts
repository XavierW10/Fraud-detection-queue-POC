import type { AccountStatus, EvidenceTransaction, TriggeredRule } from '@/db/schema';

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

/** The persisted rule ids, the vocabulary a case's `triggeredRules` uses. */
export type RuleId = (typeof RULE_IDS)[keyof typeof RULE_IDS];

export function byTimestamp(a: EvaluatedTransaction, b: EvaluatedTransaction): number {
  return a.timestamp.getTime() - b.timestamp.getTime();
}

/** The evidence view of a transaction: JSON-safe, and only the fields shown. */
export function asEvidence(tx: EvaluatedTransaction): EvidenceTransaction {
  return {
    id: tx.id,
    amount: tx.amount,
    timestamp: tx.timestamp.toISOString(),
    latitude: tx.latitude,
    longitude: tx.longitude,
    deviceId: tx.deviceId,
  };
}
