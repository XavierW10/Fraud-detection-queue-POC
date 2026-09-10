import { loadPolicy } from '@/policy/load';
import { policyStamp } from '@/policy/schema';

export default async function PolicyPage() {
  const policy = loadPolicy();
  const rules = Object.entries(policy.rules);

  return (
    <section>
      <header className="mb-4 flex items-baseline gap-3">
        <h1 className="text-base font-semibold">{policy.name}</h1>
        <p className="text-xs text-slate-500">
          {policyStamp(policy)} · escalates at {policy.escalationThreshold}
        </p>
      </header>

      <div className="space-y-2">
        {rules.map(([id, rule]) => {
          const { enabled, weight, ...parameters } = rule;
          return (
            <article key={id} className="rounded-md border border-slate-200 bg-white p-3">
              <div className="flex items-baseline gap-2">
                <h2 className="text-xs font-medium">{id}</h2>
                <span className="text-[11px] text-slate-500">weight {weight}</span>
                {!enabled && <span className="text-[11px] text-slate-400">disabled</span>}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] sm:grid-cols-4">
                {Object.entries(parameters).map(([name, value]) => (
                  <div key={name} className="flex justify-between gap-2">
                    <dt className="text-slate-500">{name}</dt>
                    <dd className="tabular-nums">
                      {Array.isArray(value) ? value.join(', ') : String(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          );
        })}
      </div>
    </section>
  );
}
