import { describe, expect, it } from 'vitest';
import { structuringRule } from '@/rules/structuring';
import { HOUR, input, policy, T0, tx } from './fixtures';

const rule = policy.rules.structuring;

describe('structuring', () => {
  it('triggers on three transactions at the inclusive amount and window edges', () => {
    const outcome = structuringRule(
      input([
        tx({ amount: 8000, timestamp: new Date(T0) }),
        tx({ amount: 9000, timestamp: new Date(T0 + 24 * HOUR) }),
        tx({ amount: 9999, timestamp: new Date(T0 + 72 * HOUR) }),
      ]),
      rule,
    );

    expect(outcome).toMatchObject({ triggered: true, weight: 45 });
    expect(outcome.reason).toContain('8000, 9000, 9999');
  });

  it('does not trigger one millisecond outside the window', () => {
    const outcome = structuringRule(
      input([
        tx({ amount: 8000, timestamp: new Date(T0) }),
        tx({ amount: 8500, timestamp: new Date(T0 + 24 * HOUR) }),
        tx({ amount: 9000, timestamp: new Date(T0 + 72 * HOUR + 1) }),
      ]),
      rule,
    );

    expect(outcome).toMatchObject({ triggered: false, weight: 0 });
  });

  it('ignores amounts outside the band, even when they are larger', () => {
    const outcome = structuringRule(
      input([
        tx({ amount: 7999.99, timestamp: new Date(T0) }),
        tx({ amount: 8500, timestamp: new Date(T0 + HOUR) }),
        tx({ amount: 10000, timestamp: new Date(T0 + 2 * HOUR) }),
      ]),
      rule,
    );

    expect(outcome.triggered).toBe(false);
  });

  it('slides past a lone early transaction and keeps the first qualifying window', () => {
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

    expect(outcome.reason).toContain('8200, 8300, 8400');
    expect(outcome.reason).not.toContain('8100');
  });
});
