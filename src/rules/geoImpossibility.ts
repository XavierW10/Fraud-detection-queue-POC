import type { GeoImpossibilityRule } from '@/policy/schema';
import {
  asEvidence,
  byTimestamp,
  RULE_IDS,
  type EvaluatedTransaction,
  type EvaluationInput,
  type RuleOutcome,
} from './types';

const HOUR_MS = 60 * 60 * 1000;

/** Great-circle distance in km between two coordinates. */
export function haversineKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
  earthRadiusKm: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Geo-impossibility: two transactions on the account imply travel strictly
 * faster than `maxKmPerHour`. The highest-speed qualifying pair is retained.
 */
export function geoImpossibilityRule(
  input: EvaluationInput,
  rule: GeoImpossibilityRule,
): RuleOutcome {
  const id = RULE_IDS.geoImpossibility;
  if (!rule.enabled) {
    return { id, triggered: false, weight: 0, reason: 'Rule disabled' };
  }

  const ordered = [...input.transactions].sort(byTimestamp);
  let fastest: {
    from: EvaluatedTransaction;
    to: EvaluatedTransaction;
    km: number;
    kmh: number;
  } | null = null;

  for (let i = 0; i < ordered.length - 1; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      const km = haversineKm(ordered[i], ordered[j], rule.earthRadiusKm);
      const hours = (ordered[j].timestamp.getTime() - ordered[i].timestamp.getTime()) / HOUR_MS;
      const kmh = hours > 0 ? km / hours : km > 0 ? Infinity : 0;
      if (kmh > rule.maxKmPerHour && (!fastest || kmh > fastest.kmh)) {
        fastest = { from: ordered[i], to: ordered[j], km, kmh };
      }
    }
  }

  if (!fastest) {
    return {
      id,
      triggered: false,
      weight: 0,
      reason: `No transaction pair implies travel faster than ${rule.maxKmPerHour} km/h`,
    };
  }

  const finite = Number.isFinite(fastest.kmh);
  const speed = finite ? `${round(fastest.kmh)} km/h` : 'instantaneous travel';
  return {
    id,
    triggered: true,
    weight: rule.weight,
    reason: `${round(fastest.km)} km between ${fastest.from.timestamp.toISOString()} and ${fastest.to.timestamp.toISOString()} implies ${speed}, above ${rule.maxKmPerHour} km/h`,
    evidence: {
      kind: 'geo_impossibility',
      from: asEvidence(fastest.from),
      to: asEvidence(fastest.to),
      distanceKm: round(fastest.km),
      // Null rather than Infinity: the two transactions share a timestamp.
      impliedKmPerHour: finite ? round(fastest.kmh) : null,
    },
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
