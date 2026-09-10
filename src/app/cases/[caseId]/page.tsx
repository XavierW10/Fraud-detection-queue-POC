import Link from 'next/link';
import { notFound } from 'next/navigation';
import { caseReference, formatAmount, formatTimestamp } from '@/components/format';
import { ACCOUNT_STATUS_LABELS, CASE_STATUS_LABELS } from '@/components/labels';
import { getDb } from '@/db/client';
import type { RuleEvidence, TriggeredRule } from '@/db/schema';
import { WorkflowError } from '@/workflow/errors';
import { getCaseDetail } from '@/workflow/queries';

export default async function CasePage({ params }: PageProps<'/cases/[caseId]'>) {
  const { caseId } = await params;

  let detail;
  try {
    detail = getCaseDetail(getDb(), caseId);
  } catch (error) {
    if (error instanceof WorkflowError && error.code === 'not_found') notFound();
    throw error;
  }

  const { case: row, account, assignee, transactions, approvals, auditEvents } = detail;
  const cited = new Set(row.triggeredRules.flatMap((rule) => evidenceTransactionIds(rule)));

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-baseline gap-3">
        <Link href="/queue" className="text-xs text-slate-500 hover:underline">
          ← Queue
        </Link>
        <h1 className="text-base font-semibold">{caseReference(row.id)}</h1>
        <span className="text-xs text-slate-500">
          {account.externalRef} · {ACCOUNT_STATUS_LABELS[account.status]}
        </span>
      </header>

      <dl className="grid grid-cols-2 gap-3 rounded-md border border-slate-200 bg-white p-3 text-xs lg:grid-cols-4">
        <Fact label="Workflow status" value={CASE_STATUS_LABELS[row.status]} />
        <Fact
          label="Risk score"
          value={`${row.riskScore}${row.requiresSenior ? ' · flagged, senior required' : ''}`}
        />
        <Fact label="Assigned analyst" value={assignee?.name ?? 'Unassigned'} />
        <Fact label="Policy version" value={row.policyVersion} />
        <Fact label="Created" value={formatTimestamp(row.createdAt)} />
        <Fact label="Last updated" value={formatTimestamp(row.updatedAt)} />
        <Fact label="Resolution" value={row.resolution ?? '—'} />
        <Fact label="Record version" value={String(row.version)} />
      </dl>

      {row.rationale && (
        <p className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-600">
          <span className="font-medium text-slate-900">Rationale: </span>
          {row.rationale}
        </p>
      )}

      <Panel title="Triggered rules">
        <ul className="divide-y divide-slate-100">
          {row.triggeredRules.map((rule) => (
            <li key={rule.id} className="px-3 py-2">
              <div className="flex items-baseline gap-2">
                <span className="font-medium">{rule.id}</span>
                <span
                  className={
                    rule.triggered
                      ? 'rounded bg-amber-100 px-1.5 text-[10px] text-amber-800'
                      : 'rounded bg-slate-100 px-1.5 text-[10px] text-slate-500'
                  }
                >
                  {rule.triggered ? `+${rule.weight}` : 'not triggered'}
                </span>
              </div>
              <p className="mt-0.5 text-slate-600">{rule.reason}</p>
              {rule.evidence && <Evidence evidence={rule.evidence} />}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title={`Transactions (${transactions.length})`}>
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <Th>Timestamp</Th>
              <Th className="text-right">Amount</Th>
              <Th>Location</Th>
              <Th>Device</Th>
              <Th>Evidence</Th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr key={tx.id} className={cited.has(tx.id) ? 'bg-amber-50' : ''}>
                <Td className="whitespace-nowrap">{formatTimestamp(tx.timestamp)}</Td>
                <Td className="text-right tabular-nums">{formatAmount(tx.amount)}</Td>
                <Td className="tabular-nums text-slate-600">
                  {tx.latitude.toFixed(3)}, {tx.longitude.toFixed(3)}
                </Td>
                <Td className="text-slate-600">{tx.deviceId}</Td>
                <Td className="text-slate-500">{cited.has(tx.id) ? 'cited by a rule' : '—'}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Approval requests">
        <ul className="divide-y divide-slate-100">
          {approvals.map(({ approval, requester }) => (
            <li key={approval.id} className="px-3 py-2">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium">
                  recommends {approval.recommendedResolution.replace('_', ' ')}
                </span>
                <span className="text-slate-500">
                  {approval.status} · requested by {requester.name}
                </span>
              </div>
              <p className="mt-0.5 text-slate-600">{approval.requesterReason}</p>
              {approval.seniorDecisionReason && (
                <p className="mt-0.5 text-slate-600">
                  <span className="font-medium">Senior: </span>
                  {approval.seniorDecisionReason}
                </p>
              )}
            </li>
          ))}
          {approvals.length === 0 && <Empty>No approval has been requested.</Empty>}
        </ul>
      </Panel>

      <Panel title="Audit history">
        <ul className="divide-y divide-slate-100">
          {auditEvents.map((event) => (
            <li key={event.id} className="flex flex-wrap gap-2 px-3 py-1.5">
              <span className="whitespace-nowrap text-slate-500">
                {formatTimestamp(event.createdAt)}
              </span>
              <span className="font-medium">{event.action}</span>
              {event.fromStatus && (
                <span className="text-slate-600">
                  {event.fromStatus} → {event.toStatus}
                </span>
              )}
              <span className="ml-auto text-slate-500">{event.actor?.name ?? 'system'}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </section>
  );
}

/** Which transactions a rule pointed at, so the table can highlight them. */
function evidenceTransactionIds(rule: TriggeredRule): string[] {
  if (!rule.evidence) return [];
  switch (rule.evidence.kind) {
    case 'structuring':
      return rule.evidence.transactions.map((tx) => tx.id);
    case 'geo_impossibility':
      return [rule.evidence.from.id, rule.evidence.to.id];
    case 'shared_device_linkage':
      return rule.evidence.transactions.map((tx) => tx.id);
  }
}

function Evidence({ evidence }: { evidence: RuleEvidence }) {
  switch (evidence.kind) {
    case 'structuring':
      return (
        <Detail>
          {evidence.transactions.length} deposits over {evidence.spanHours.toFixed(1)}h,{' '}
          {evidence.transactions.map((tx) => formatAmount(tx.amount)).join(' + ')}
        </Detail>
      );
    case 'geo_impossibility':
      return (
        <Detail>
          {evidence.distanceKm.toFixed(0)} km at{' '}
          {evidence.impliedKmPerHour === null
            ? 'the same instant'
            : `${evidence.impliedKmPerHour.toFixed(0)} km/h`}
        </Detail>
      );
    case 'shared_device_linkage':
      return (
        <Detail>
          {evidence.links.map((link) => `${link.deviceId} → ${link.accountStatus}`).join(', ')}
        </Detail>
      );
  }
}

function Detail({ children }: { children: React.ReactNode }) {
  return <p className="mt-0.5 text-[11px] text-slate-500">{children}</p>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white text-xs">
      <h2 className="border-b border-slate-200 bg-slate-50 px-3 py-2 font-medium">{title}</h2>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <li className="px-3 py-2 text-slate-500">{children}</li>;
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-1.5 font-medium ${className}`}>{children}</th>;
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-1.5 ${className}`}>{children}</td>;
}
