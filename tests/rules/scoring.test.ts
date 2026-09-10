import { describe, expect, it } from 'vitest';
import { evaluateAccount, requiresSenior } from '@/rules/engine';
import { RULE_IDS } from '@/rules/types';
import { HOUR, input, policy, T0, TOKYO, tx } from './fixtures';

describe('score aggregation', () => {
  it('counts a rule once no matter how many transactions match it', () => {
    const threeWindows = evaluateAccount(
      input(
        Array.from({ length: 9 }, (_, i) =>
          tx({ amount: 8000 + i, timestamp: new Date(T0 + i * HOUR) }),
        ),
      ),
      policy,
    );

    expect(threeWindows.riskScore).toBe(policy.rules.structuring.weight);
    expect(threeWindows.triggeredRules.filter((r) => r.triggered)).toHaveLength(1);
  });

  it('reports every rule that ran, scoring only the triggered ones', () => {
    const { riskScore, triggeredRules } = evaluateAccount(input([tx()]), policy);

    expect(triggeredRules.map((r) => r.id)).toEqual([
      RULE_IDS.structuring,
      RULE_IDS.geoImpossibility,
      RULE_IDS.sharedDeviceLinkage,
    ]);
    expect(riskScore).toBe(0);
  });

  it('flags the account only once the summed weights reach the threshold', () => {
    const geoOnly = evaluateAccount(
      input([tx({ timestamp: new Date(T0) }), tx({ ...TOKYO, timestamp: new Date(T0 + HOUR) })]),
      policy,
    );
    expect(geoOnly.riskScore).toBe(35);
    expect(requiresSenior(geoOnly.riskScore, policy)).toBe(false);

    const geoAndDevice = evaluateAccount(
      input(
        [
          tx({ timestamp: new Date(T0), deviceId: 'device-shared' }),
          tx({ ...TOKYO, timestamp: new Date(T0 + HOUR), deviceId: 'device-shared' }),
        ],
        [{ deviceId: 'device-shared', accountId: 'other-bad', accountStatus: 'known_bad' }],
      ),
      policy,
    );
    expect(geoAndDevice.riskScore).toBe(75);
    expect(requiresSenior(geoAndDevice.riskScore, policy)).toBe(true);

    // The threshold itself is inclusive.
    expect(requiresSenior(policy.escalationThreshold, policy)).toBe(true);
    expect(requiresSenior(policy.escalationThreshold - 1, policy)).toBe(false);
  });
});
