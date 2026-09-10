import { loadPolicy } from '@/policy/load';
import type { DeviceLink, EvaluatedTransaction, EvaluationInput } from '@/rules/types';

export const policy = loadPolicy();

export const ACCOUNT = 'account-under-review';
export const T0 = new Date('2024-05-01T00:00:00Z').getTime();
export const HOUR = 60 * 60 * 1000;

export const LONDON = { latitude: 51.5072, longitude: -0.1276 };
export const PARIS = { latitude: 48.8566, longitude: 2.3522 };
export const TOKYO = { latitude: 35.6762, longitude: 139.6503 };

let counter = 0;

export function tx(overrides: Partial<EvaluatedTransaction> = {}): EvaluatedTransaction {
  counter += 1;
  return {
    id: `tx-${counter}`,
    accountId: ACCOUNT,
    amount: 100,
    timestamp: new Date(T0),
    deviceId: 'device-a',
    ...LONDON,
    ...overrides,
  };
}

export function input(
  transactions: EvaluatedTransaction[],
  deviceLinks: DeviceLink[] = [],
): EvaluationInput {
  return { accountId: ACCOUNT, transactions, deviceLinks };
}
