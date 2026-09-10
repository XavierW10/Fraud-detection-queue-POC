import { formatAmount } from '@/components/format';
import { ACCOUNT_STATUS_LABELS, RULE_LABELS } from '@/components/labels';
import { loadPolicy } from '@/policy/load';
import { policyStamp, type Policy } from '@/policy/schema';
import { RULE_IDS } from '@/rules/types';

type Presented = {
  id: string;
  label: string;
  enabled: boolean;
  weight: number;
  /** What the rule looks for, in the operator's words. */
  summary: string;
  parameters: { name: string; value: string }[];
};

/**
 * The YAML is the source of truth, so every number below is read from it —
 * nothing on this page is a restatement an edit to the policy could invalidate.
 */
function present(policy: Policy): Presented[] {
  const { structuring, geoImpossibility, sharedDeviceLinkage } = policy.rules;

  return [
    {
      id: RULE_IDS.structuring,
      label: RULE_LABELS[RULE_IDS.structuring],
      enabled: structuring.enabled,
      weight: structuring.weight,
      summary: `Deposits sized just under a reporting threshold, repeated: ${structuring.minTransactions} or more transactions between ${formatAmount(structuring.minAmount)} and ${formatAmount(structuring.maxAmount)} inside any ${structuring.windowHours}-hour window on the same account.`,
      parameters: [
        { name: 'Transactions in window', value: `at least ${structuring.minTransactions}` },
        {
          name: 'Amount band',
          value: `${formatAmount(structuring.minAmount)} – ${formatAmount(structuring.maxAmount)}`,
        },
        { name: 'Window', value: `${structuring.windowHours} hours` },
      ],
    },
    {
      id: RULE_IDS.geoImpossibility,
      label: RULE_LABELS[RULE_IDS.geoImpossibility],
      enabled: geoImpossibility.enabled,
      weight: geoImpossibility.weight,
      summary: `Two transactions on the same account further apart than the account holder could travel: faster than ${geoImpossibility.maxKmPerHour} km/h great-circle between them.`,
      parameters: [
        { name: 'Implied speed', value: `over ${geoImpossibility.maxKmPerHour} km/h` },
        { name: 'Earth radius', value: `${geoImpossibility.earthRadiusKm} km` },
      ],
    },
    {
      id: RULE_IDS.sharedDeviceLinkage,
      label: RULE_LABELS[RULE_IDS.sharedDeviceLinkage],
      enabled: sharedDeviceLinkage.enabled,
      weight: sharedDeviceLinkage.weight,
      summary:
        'A device this account transacts from is also used by an account already carrying a suspicious status. Direct links only — the rule never follows a second hop, and never changes the linked account.',
      parameters: [
        {
          name: 'Linked statuses',
          value: sharedDeviceLinkage.linkedAccountStatuses
            .map((status) => ACCOUNT_STATUS_LABELS[status])
            .join(', '),
        },
      ],
    },
  ];
}

export default async function PolicyPage() {
  const policy = loadPolicy();
  const rules = present(policy);
  const enabled = rules.filter((rule) => rule.enabled);
  const maximum = enabled.reduce((total, rule) => total + rule.weight, 0);

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-base font-semibold">{policy.name}</h1>
        <p className="mt-1 text-xs text-slate-500">
          {policyStamp(policy)} · read-only. The policy is loaded from{' '}
          <code className="rounded bg-slate-100 px-1">fraud-policy.yaml</code> at evaluation time
          and cannot be changed from this application. Each case records the version it was scored
          under.
        </p>
      </header>

      <article className="rounded-md border border-slate-200 bg-white p-3">
        <h2 className="text-xs font-medium">How a case is scored</h2>
        <p className="mt-1 text-xs text-slate-600">
          Every enabled rule is evaluated against the account&apos;s transactions and contributes
          its weight at most once, however many records match. The weights sum to the risk score,
          out of {maximum} if every rule fires. A case scoring{' '}
          <span className="font-medium text-slate-900">{policy.escalationThreshold} or higher</span>{' '}
          is flagged and can only be closed by a Senior Fraud Analyst; below that, the assigned
          analyst resolves it directly.
        </p>
        <ul className="mt-2 space-y-1 text-xs text-slate-600">
          {enabled.map((rule) => (
            <li key={rule.id} className="flex items-baseline gap-2">
              <span className="w-10 tabular-nums font-medium text-slate-900">{rule.weight}</span>
              <span>{rule.label}</span>
              <span className="text-slate-500">
                {rule.weight >= policy.escalationThreshold
                  ? 'escalates on its own'
                  : 'needs a second rule to escalate'}
              </span>
            </li>
          ))}
        </ul>
      </article>

      <div className="space-y-2">
        {rules.map((rule) => (
          <article key={rule.id} className="rounded-md border border-slate-200 bg-white p-3">
            <div className="flex items-baseline gap-2">
              <h2 className="text-xs font-medium">{rule.label}</h2>
              <code className="text-[11px] text-slate-400">{rule.id}</code>
              <span className="ml-auto text-[11px] text-slate-500">weight {rule.weight}</span>
              {!rule.enabled && <span className="text-[11px] text-amber-700">disabled</span>}
            </div>
            <p className="mt-1 text-xs text-slate-600">{rule.summary}</p>
            <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-[11px] sm:grid-cols-3">
              {rule.parameters.map((parameter) => (
                <div key={parameter.name} className="flex justify-between gap-2">
                  <dt className="text-slate-500">{parameter.name}</dt>
                  <dd className="tabular-nums">{parameter.value}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
