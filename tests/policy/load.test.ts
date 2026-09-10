import { describe, expect, it } from 'vitest';
import { loadPolicy, parsePolicy, PolicyError } from '@/policy/load';
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

describe('policy loading', () => {
  it('loads the committed policy file', () => {
    const policy = loadPolicy();

    expect(policyStamp(policy)).toBe('aml-transaction-monitoring-policy@1.0.0');
    expect(policy.name).toBe('AML Transaction Monitoring Policy');
    expect(policy.escalationThreshold).toBe(60);
    expect([
      policy.rules.structuring.weight,
      policy.rules.geoImpossibility.weight,
      policy.rules.sharedDeviceLinkage.weight,
    ]).toEqual([45, 35, 40]);
  });

  it('fails clearly when the policy file is missing', () => {
    expect(() => loadPolicy('/nonexistent/fraud-policy.yaml')).toThrow(PolicyError);
    expect(() => loadPolicy('/nonexistent/fraud-policy.yaml')).toThrow(/cannot read policy file/);
  });

  it.each([
    ['malformed YAML', 'policyId: [unterminated', /malformed YAML/],
    [
      'a duplicate rule id',
      VALID.replace(
        '  geoImpossibility:',
        '  structuring: { enabled: false, weight: 1 }\n  geoImpossibility:',
      ),
      /malformed YAML/,
    ],
    [
      'a missing rule',
      VALID.replace(/  geoImpossibility:[\s\S]*?    earthRadiusKm: 6371\n/, ''),
      /geoImpossibility/,
    ],
    ['an unknown rule id', VALID.replace('  structuring:', '  strukturing:'), /strukturing/],
    [
      'a non-positive threshold',
      VALID.replace('escalationThreshold: 60', 'escalationThreshold: 0'),
      /escalationThreshold/,
    ],
    [
      'a non-numeric threshold',
      VALID.replace('escalationThreshold: 60', 'escalationThreshold: high'),
      /escalationThreshold/,
    ],
    ['a negative weight', VALID.replace('weight: 45', 'weight: -45'), /weight/],
    [
      'an unknown linked status',
      VALID.replace('- flagged', '- suspicious'),
      /linkedAccountStatuses/,
    ],
    ['an inverted amount band', VALID.replace('minAmount: 8000', 'minAmount: 12000'), /minAmount/],
  ])('rejects %s', (_label, yaml, detail) => {
    expect(() => parsePolicy(yaml)).toThrow(PolicyError);
    expect(() => parsePolicy(yaml)).toThrow(detail);
  });
});
