import type { SharedDeviceLinkageRule } from '@/policy/schema';
import { asEvidence, byTimestamp, RULE_IDS, type EvaluationInput, type RuleOutcome } from './types';

/**
 * Shared-device linkage: a device used by this account is also used by a
 * different account whose stored status is suspicious. Only direct links are
 * reported — flags are never propagated recursively and no account status is
 * changed during evaluation.
 */
export function sharedDeviceLinkageRule(
  input: EvaluationInput,
  rule: SharedDeviceLinkageRule,
): RuleOutcome {
  const id = RULE_IDS.sharedDeviceLinkage;
  if (!rule.enabled) {
    return { id, triggered: false, weight: 0, reason: 'Rule disabled' };
  }

  const devices = new Set(input.transactions.map((tx) => tx.deviceId));
  const statuses = new Set<string>(rule.linkedAccountStatuses);
  const links = input.deviceLinks.filter(
    (link) =>
      link.accountId !== input.accountId &&
      devices.has(link.deviceId) &&
      statuses.has(link.accountStatus),
  );

  if (links.length === 0) {
    return {
      id,
      triggered: false,
      weight: 0,
      reason: `No device shared with an account in status ${rule.linkedAccountStatuses.join(' or ')}`,
    };
  }

  const distinct = [
    ...new Map(links.map((link) => [`${link.deviceId}:${link.accountId}`, link])).values(),
  ];
  const described = distinct.map(
    (link) => `${link.deviceId} -> ${link.accountId} (${link.accountStatus})`,
  );
  const sharedDevices = new Set(distinct.map((link) => link.deviceId));

  return {
    id,
    triggered: true,
    weight: rule.weight,
    reason: `Device shared with ${described.length} linked account(s): ${described.join(', ')}`,
    evidence: {
      kind: 'shared_device_linkage',
      links: distinct.map((link) => ({
        deviceId: link.deviceId,
        accountId: link.accountId,
        accountStatus: link.accountStatus,
      })),
      transactions: input.transactions
        .filter((tx) => sharedDevices.has(tx.deviceId))
        .sort(byTimestamp)
        .map(asEvidence),
    },
  };
}
