import { describe, expect, it } from 'vitest';
import { loadPolicy, parsePolicy } from '@/policy/load';
import { policyStamp } from '@/policy/schema';

const VALID = `
policyId: aml-transaction-monitoring-policy
name: AML Transaction Monitoring Policy
policyVersion: 1.0.0
escalationThreshold: 60
rules:
  structuring:
    enabled: true
    weight: 45
    minTransactions: 3
    minAmount: 8000
    maxAmount: 9999
    windowHours: 72
  geoImpossibility:
    enabled: true
    weight: 35
    maxKmPerHour: 800
    earthRadiusKm: 6371
  sharedDeviceLinkage:
    enabled: true
    weight: 40
    linkedAccountStatuses:
      - flagged
      - known_bad
`;

function withPatch(patch: string) {
  return VALID.replace('escalationThreshold: 60', patch);
}

describe('policy loading', () => {
  it('loads and validates the repo policy file', () => {
    const policy = loadPolicy();
    expect(policy.policyId).toBe('aml-transaction-monitoring-policy');
    expect(policy.name).toBe('AML Transaction Monitoring Policy');
    expect(policy.policyVersion).toBe('1.0.0');
    expect(policy.escalationThreshold).toBe(60);
    expect(policy.rules.structuring.weight).toBe(45);
    expect(policy.rules.geoImpossibility.weight).toBe(35);
    expect(policy.rules.sharedDeviceLinkage.weight).toBe(40);
    expect(policyStamp(policy)).toBe('aml-transaction-monitoring-policy@1.0.0');
  });

  it('accepts a valid inline config', () => {
    expect(parsePolicy(VALID).rules.geoImpossibility.maxKmPerHour).toBe(800);
  });

  it.each([
    ['zero escalationThreshold', withPatch('escalationThreshold: 0')],
    ['negative escalationThreshold', withPatch('escalationThreshold: -10')],
    ['non-numeric escalationThreshold', withPatch('escalationThreshold: high')],
    ['missing escalationThreshold', VALID.replace('escalationThreshold: 60\n', '')],
    ['missing policyVersion', VALID.replace('policyVersion: 1.0.0\n', '')],
    ['negative weight', VALID.replace('weight: 45', 'weight: -45')],
    ['minAmount above maxAmount', VALID.replace('minAmount: 8000', 'minAmount: 12000')],
    ['unknown linked account status', VALID.replace('- flagged', '- suspicious')],
  ])('throws on %s', (_label, yaml) => {
    expect(() => parsePolicy(yaml)).toThrow(/Invalid fraud policy/);
  });
});
