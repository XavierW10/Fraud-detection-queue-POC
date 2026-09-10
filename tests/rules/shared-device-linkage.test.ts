import { describe, expect, it } from 'vitest';
import { sharedDeviceLinkageRule } from '@/rules/sharedDeviceLinkage';
import { ACCOUNT, input, policy, tx } from './fixtures';

const rule = policy.rules.sharedDeviceLinkage;

describe('shared-device linkage', () => {
  it('triggers on a device shared with a flagged or known-bad account', () => {
    const outcome = sharedDeviceLinkageRule(
      input(
        [tx({ deviceId: 'device-shared' })],
        [
          { deviceId: 'device-shared', accountId: 'other-1', accountStatus: 'flagged' },
          { deviceId: 'device-shared', accountId: 'other-2', accountStatus: 'known_bad' },
        ],
      ),
      rule,
    );

    expect(outcome).toMatchObject({ triggered: true, weight: 40 });
    expect(outcome.reason).toContain('other-1');
    expect(outcome.reason).toContain('other-2');
  });

  it('ignores non-suspicious accounts, the account itself, and other devices', () => {
    const outcome = sharedDeviceLinkageRule(
      input(
        [tx({ deviceId: 'device-a' })],
        [
          { deviceId: 'device-a', accountId: 'other-clear', accountStatus: 'clear' },
          { deviceId: 'device-a', accountId: 'other-cleared', accountStatus: 'cleared' },
          { deviceId: 'device-a', accountId: ACCOUNT, accountStatus: 'known_bad' },
          { deviceId: 'device-b', accountId: 'other-bad', accountStatus: 'known_bad' },
        ],
      ),
      rule,
    );

    expect(outcome).toMatchObject({ triggered: false, weight: 0 });
  });

  it('reports direct links only, without propagating through the linked account', () => {
    const outcome = sharedDeviceLinkageRule(
      input(
        [tx({ deviceId: 'device-a' })],
        [
          { deviceId: 'device-a', accountId: 'direct', accountStatus: 'flagged' },
          // 'direct' also transacts on device-b alongside 'indirect'.
          { deviceId: 'device-b', accountId: 'indirect', accountStatus: 'known_bad' },
        ],
      ),
      rule,
    );

    expect(outcome.reason).toContain('direct');
    expect(outcome.reason).not.toContain('indirect');
  });
});
