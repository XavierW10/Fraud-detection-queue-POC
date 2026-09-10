import { describe, expect, it } from 'vitest';
import { geoImpossibilityRule, haversineKm } from '@/rules/geoImpossibility';
import { HOUR, input, LONDON, PARIS, policy, T0, TOKYO, tx } from './fixtures';

const rule = policy.rules.geoImpossibility;

describe('geo-impossibility', () => {
  it('measures great-circle distance with the configured earth radius', () => {
    expect(haversineKm(LONDON, PARIS, rule.earthRadiusKm)).toBeCloseTo(344, -1);
    expect(haversineKm(LONDON, TOKYO, rule.earthRadiusKm)).toBeCloseTo(9558, -2);
  });

  it('does not trigger at exactly the speed limit', () => {
    // Due north along a meridian: distance is exactly radius * latitude delta.
    const dLat = ((rule.maxKmPerHour / rule.earthRadiusKm) * 180) / Math.PI;
    const outcome = geoImpossibilityRule(
      input([
        tx({ latitude: 0, longitude: 0, timestamp: new Date(T0) }),
        tx({ latitude: dLat, longitude: 0, timestamp: new Date(T0 + HOUR) }),
      ]),
      rule,
    );

    expect(outcome).toMatchObject({ triggered: false, weight: 0 });
  });

  it('retains the fastest qualifying pair, not the first or the farthest', () => {
    const outcome = geoImpossibilityRule(
      input([
        tx({ ...LONDON, timestamp: new Date(T0) }),
        tx({ ...PARIS, timestamp: new Date(T0 + HOUR / 4) }), // ~1376 km/h from London
        tx({ ...TOKYO, timestamp: new Date(T0 + HOUR) }), // ~12949 km/h from Paris
      ]),
      rule,
    );

    expect(outcome).toMatchObject({ triggered: true, weight: 35 });
    expect(outcome.reason).toContain('9711.72 km');
    expect(outcome.reason).toContain('12948.97 km/h');
  });

  it('treats two places at the same instant as impossible rather than dividing by zero', () => {
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
