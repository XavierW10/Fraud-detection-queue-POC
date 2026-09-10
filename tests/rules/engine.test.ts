import { describe, expect, it } from 'vitest';
import { loadPolicy } from '@/policy/load';
import { evaluateAccount, requiresSenior } from '@/rules/engine';
import { geoImpossibilityRule, haversineKm } from '@/rules/geoImpossibility';
import { sharedDeviceLinkageRule } from '@/rules/sharedDeviceLinkage';
import { structuringRule } from '@/rules/structuring';
import { RULE_IDS, type DeviceLink, type EvaluatedTransaction } from '@/rules/types';

const policy = loadPolicy();
const ACCOUNT = 'account-under-review';
const T0 = new Date('2024-05-01T00:00:00Z').getTime();
const HOUR = 60 * 60 * 1000;

let counter = 0;
function tx(overrides: Partial<EvaluatedTransaction> = {}): EvaluatedTransaction {
  counter += 1;
  return {
    id: `tx-${counter}`,
    accountId: ACCOUNT,
    amount: 100,
    timestamp: new Date(T0),
    latitude: 51.5072,
    longitude: -0.1276,
    deviceId: 'device-a',
    ...overrides,
  };
}

function input(transactions: EvaluatedTransaction[], deviceLinks: DeviceLink[] = []) {
  return { accountId: ACCOUNT, transactions, deviceLinks };
}

describe('structuring rule', () => {
  const rule = policy.rules.structuring;

  it('triggers on three in-band transactions inside the window', () => {
    const outcome = structuringRule(
      input([
        tx({ amount: 8000, timestamp: new Date(T0) }),
        tx({ amount: 9000, timestamp: new Date(T0 + 24 * HOUR) }),
        tx({ amount: 9999, timestamp: new Date(T0 + 72 * HOUR) }),
      ]),
      rule,
    );
    expect(outcome).toMatchObject({ id: RULE_IDS.structuring, triggered: true, weight: 45 });
    expect(outcome.reason).toContain('8000, 9000, 9999');
  });

  it('treats the window as inclusive and the amount band as inclusive', () => {
    const justOutside = structuringRule(
      input([
        tx({ amount: 8000, timestamp: new Date(T0) }),
        tx({ amount: 8500, timestamp: new Date(T0 + 24 * HOUR) }),
        tx({ amount: 9000, timestamp: new Date(T0 + 72 * HOUR + 1) }),
      ]),
      rule,
    );
    expect(justOutside.triggered).toBe(false);

    const outOfBand = structuringRule(
      input([
        tx({ amount: 7999.99, timestamp: new Date(T0) }),
        tx({ amount: 8500, timestamp: new Date(T0 + HOUR) }),
        tx({ amount: 10000, timestamp: new Date(T0 + 2 * HOUR) }),
      ]),
      rule,
    );
    expect(outOfBand.triggered).toBe(false);
  });

  it('slides the window and keeps the first qualifying window as evidence', () => {
    const outcome = structuringRule(
      input([
        tx({ amount: 8100, timestamp: new Date(T0) }),
        tx({ amount: 8200, timestamp: new Date(T0 + 100 * HOUR) }),
        tx({ amount: 8300, timestamp: new Date(T0 + 110 * HOUR) }),
        tx({ amount: 8400, timestamp: new Date(T0 + 120 * HOUR) }),
        tx({ amount: 8500, timestamp: new Date(T0 + 300 * HOUR) }),
      ]),
      rule,
    );
    expect(outcome.triggered).toBe(true);
    expect(outcome.reason).toContain('8200, 8300, 8400');
    expect(outcome.reason).not.toContain('8100');
  });

  it('does not trigger below minTransactions', () => {
    const outcome = structuringRule(
      input([
        tx({ amount: 8000, timestamp: new Date(T0) }),
        tx({ amount: 9000, timestamp: new Date(T0 + HOUR) }),
      ]),
      rule,
    );
    expect(outcome).toMatchObject({ triggered: false, weight: 0 });
  });
});

describe('geo-impossibility rule', () => {
  const rule = policy.rules.geoImpossibility;
  const LONDON = { latitude: 51.5072, longitude: -0.1276 };
  const TOKYO = { latitude: 35.6762, longitude: 139.6503 };
  const PARIS = { latitude: 48.8566, longitude: 2.3522 };

  it('computes haversine distance with the configured earth radius', () => {
    expect(haversineKm(LONDON, TOKYO, rule.earthRadiusKm)).toBeCloseTo(9558, -2);
    expect(haversineKm(LONDON, PARIS, rule.earthRadiusKm)).toBeCloseTo(344, -1);
  });

  it('triggers above 800 km/h and retains the fastest pair', () => {
    const outcome = geoImpossibilityRule(
      input([
        tx({ ...LONDON, timestamp: new Date(T0) }),
        tx({ ...PARIS, timestamp: new Date(T0 + HOUR / 4) }), // ~1376 km/h from London
        tx({ ...TOKYO, timestamp: new Date(T0 + HOUR) }), // ~12949 km/h from Paris
      ]),
      rule,
    );
    expect(outcome).toMatchObject({ id: RULE_IDS.geoImpossibility, triggered: true, weight: 35 });
    // Paris -> Tokyo is the fastest pair, not London -> Tokyo.
    expect(outcome.reason).toContain('9711.72 km');
    expect(outcome.reason).toContain('12948.97 km/h');
  });

  it('does not trigger at or below the speed limit', () => {
    const outcome = geoImpossibilityRule(
      input([
        tx({ ...LONDON, timestamp: new Date(T0) }),
        tx({ ...PARIS, timestamp: new Date(T0 + HOUR) }), // ~344 km/h
      ]),
      rule,
    );
    expect(outcome).toMatchObject({ triggered: false, weight: 0 });
  });

  it('treats distance with no elapsed time as impossible travel', () => {
    const outcome = geoImpossibilityRule(
      input([
        tx({ ...LONDON, timestamp: new Date(T0) }),
        tx({ ...TOKYO, timestamp: new Date(T0) }),
      ]),
      rule,
    );
    expect(outcome.triggered).toBe(true);
    expect(outcome.reason).toContain('instantaneous travel');
  });
});

describe('shared-device linkage rule', () => {
  const rule = policy.rules.sharedDeviceLinkage;

  it('triggers on a device shared with a flagged or confirmed-fraud account', () => {
    const outcome = sharedDeviceLinkageRule(
      input(
        [tx({ deviceId: 'device-shared' })],
        [
          { deviceId: 'device-shared', accountId: 'other-1', accountStatus: 'flagged' },
          { deviceId: 'device-shared', accountId: 'other-2', accountStatus: 'confirmed_fraud' },
        ],
      ),
      rule,
    );
    expect(outcome).toMatchObject({
      id: RULE_IDS.sharedDeviceLinkage,
      triggered: true,
      weight: 40,
    });
    expect(outcome.reason).toContain('other-1');
    expect(outcome.reason).toContain('other-2');
  });

  it('ignores clean linked accounts, the account itself, and unrelated devices', () => {
    const outcome = sharedDeviceLinkageRule(
      input(
        [tx({ deviceId: 'device-a' })],
        [
          { deviceId: 'device-a', accountId: 'other-clean', accountStatus: 'clear' },
          { deviceId: 'device-a', accountId: 'other-cleared', accountStatus: 'cleared' },
          { deviceId: 'device-a', accountId: ACCOUNT, accountStatus: 'flagged' },
          { deviceId: 'device-other', accountId: 'other-bad', accountStatus: 'confirmed_fraud' },
        ],
      ),
      rule,
    );
    expect(outcome).toMatchObject({ triggered: false, weight: 0 });
  });

  it('reports only direct links, without propagating through the linked account', () => {
    const outcome = sharedDeviceLinkageRule(
      input(
        [tx({ deviceId: 'device-a' })],
        [
          { deviceId: 'device-a', accountId: 'direct', accountStatus: 'flagged' },
          // 'direct' also uses device-b with 'indirect' — must not be reported.
          { deviceId: 'device-b', accountId: 'indirect', accountStatus: 'confirmed_fraud' },
        ],
      ),
      rule,
    );
    expect(outcome.triggered).toBe(true);
    expect(outcome.reason).toContain('direct');
    expect(outcome.reason).not.toContain('indirect');
  });
});

describe('score aggregation', () => {
  it('sums the weights of triggered rules only', () => {
    const { riskScore, triggeredRules } = evaluateAccount(
      input([
        tx({ amount: 8000, timestamp: new Date(T0), deviceId: 'device-a' }),
        tx({ amount: 8500, timestamp: new Date(T0 + HOUR), deviceId: 'device-a' }),
        tx({ amount: 9999, timestamp: new Date(T0 + 2 * HOUR), deviceId: 'device-a' }),
      ]),
      policy,
    );

    expect(triggeredRules).toHaveLength(3);
    expect(triggeredRules.filter((r) => r.triggered).map((r) => r.id)).toEqual([
      RULE_IDS.structuring,
    ]);
    expect(riskScore).toBe(45);
    expect(requiresSenior(riskScore, policy)).toBe(false);
  });

  it('crosses the escalation threshold when two rules trigger', () => {
    const { riskScore } = evaluateAccount(
      input(
        [
          tx({ amount: 100, timestamp: new Date(T0), deviceId: 'device-shared' }),
          tx({
            amount: 100,
            timestamp: new Date(T0 + HOUR),
            latitude: 35.6762,
            longitude: 139.6503,
            deviceId: 'device-shared',
          }),
        ],
        [{ deviceId: 'device-shared', accountId: 'other-bad', accountStatus: 'confirmed_fraud' }],
      ),
      policy,
    );

    expect(riskScore).toBe(75);
    expect(requiresSenior(riskScore, policy)).toBe(true);
  });

  it('scores zero when nothing triggers', () => {
    const { riskScore, triggeredRules } = evaluateAccount(input([tx()]), policy);
    expect(riskScore).toBe(0);
    expect(triggeredRules.every((r) => !r.triggered)).toBe(true);
  });
});
