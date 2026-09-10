import { describe, expect, it } from 'vitest';
import { geoImpossibilityRule } from '@/rules/geoImpossibility';
import { sharedDeviceLinkageRule } from '@/rules/sharedDeviceLinkage';
import { structuringRule } from '@/rules/structuring';
import { HOUR, input, LONDON, policy, T0, TOKYO, tx } from './fixtures';

/**
 * Evidence has to name the records a rule matched, not just describe them: the
 * reviewer's job is to look at those rows, and a sentence cannot be clicked.
 */
describe('evidence', () => {
  it('names the transactions in the qualifying structuring window, and no others', () => {
    const early = tx({ amount: 8100, timestamp: new Date(T0) });
    const outOfBand = tx({ amount: 20000, timestamp: new Date(T0 + 80 * HOUR) });
    const window = [
      tx({ amount: 8200, timestamp: new Date(T0 + 80 * HOUR) }),
      tx({ amount: 8300, timestamp: new Date(T0 + 100 * HOUR) }),
      tx({ amount: 8400, timestamp: new Date(T0 + 140 * HOUR) }),
    ];

    const outcome = structuringRule(input([early, outOfBand, ...window]), policy.rules.structuring);

    expect(outcome.evidence).toEqual({
      kind: 'structuring',
      transactions: window.map((transaction) => ({
        id: transaction.id,
        amount: transaction.amount,
        timestamp: transaction.timestamp.toISOString(),
        latitude: transaction.latitude,
        longitude: transaction.longitude,
        deviceId: transaction.deviceId,
      })),
      windowStart: window[0].timestamp.toISOString(),
      windowEnd: window[2].timestamp.toISOString(),
      spanHours: 60,
    });
  });

  it('names the fastest pair and reports instantaneous travel as no speed at all', () => {
    const from = tx({ timestamp: new Date(T0), ...LONDON });
    const to = tx({ timestamp: new Date(T0 + HOUR), ...TOKYO });
    const measured = geoImpossibilityRule(input([from, to]), policy.rules.geoImpossibility);

    expect(measured.evidence).toMatchObject({
      kind: 'geo_impossibility',
      from: { id: from.id },
      to: { id: to.id },
      distanceKm: 9558.57,
      impliedKmPerHour: 9558.57,
    });

    const simultaneous = geoImpossibilityRule(
      input([
        tx({ timestamp: new Date(T0), ...LONDON }),
        tx({ timestamp: new Date(T0), ...TOKYO }),
      ]),
      policy.rules.geoImpossibility,
    );

    // JSON has no Infinity, so the persisted evidence says "unmeasurable" instead.
    expect(simultaneous.evidence).toMatchObject({ impliedKmPerHour: null });
  });

  it('names the linked accounts and this account own transactions on the shared device', () => {
    const shared = tx({ deviceId: 'device-shared' });
    const unrelated = tx({ deviceId: 'device-own' });

    const outcome = sharedDeviceLinkageRule(
      input(
        [shared, unrelated],
        [
          { deviceId: 'device-shared', accountId: 'account-known-bad', accountStatus: 'known_bad' },
          { deviceId: 'device-shared', accountId: 'account-known-bad', accountStatus: 'known_bad' },
          { deviceId: 'device-own', accountId: 'account-clean', accountStatus: 'clear' },
        ],
      ),
      policy.rules.sharedDeviceLinkage,
    );

    expect(outcome.evidence).toEqual({
      kind: 'shared_device_linkage',
      links: [
        { deviceId: 'device-shared', accountId: 'account-known-bad', accountStatus: 'known_bad' },
      ],
      transactions: [expect.objectContaining({ id: shared.id })],
    });
  });

  it('leaves evidence off a rule that did not trigger', () => {
    const quiet = input([tx({ amount: 100 })]);

    expect(structuringRule(quiet, policy.rules.structuring).evidence).toBeUndefined();
    expect(geoImpossibilityRule(quiet, policy.rules.geoImpossibility).evidence).toBeUndefined();
    expect(
      sharedDeviceLinkageRule(quiet, policy.rules.sharedDeviceLinkage).evidence,
    ).toBeUndefined();
  });
});
