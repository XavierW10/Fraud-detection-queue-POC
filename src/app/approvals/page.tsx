import Link from 'next/link';
import { getCurrentUser } from '@/auth/currentUser';
import { CaseActions } from '@/components/CaseActions';
import { caseReference, formatDuration } from '@/components/format';
import { RECOMMENDATION_LABELS, ruleLabel } from '@/components/labels';
import { getDb } from '@/db/client';
import { listApprovals } from '@/workflow/queries';

export default async function ApprovalsPage() {
  const db = getDb();
  const currentUser = await getCurrentUser(db);

  // The nav hides this tab for an analyst; the page refuses it as well, because
  // a hidden link is not an access control.
  if (currentUser.role !== 'senior') {
    return (
      <p className="rounded-md border border-slate-200 bg-white p-4 text-xs text-slate-600">
        Approval requests are reviewed by a Senior Fraud Analyst. Switch persona to see this queue.
      </p>
    );
  }

  // Already ordered oldest first: the longest wait is the next decision.
  const pending = listApprovals(db, { status: 'pending' });
  const now = new Date();

  return (
    <section>
      <header className="mb-4 flex items-baseline gap-3">
        <h1 className="text-base font-semibold">Approval requests</h1>
        <p className="text-xs text-slate-500">{pending.length} awaiting a decision</p>
      </header>

      <ul className="space-y-2">
        {pending.map(({ approval, account, case: row, requester }) => (
          <li key={approval.id} className="rounded-md border border-slate-200 bg-white p-3 text-xs">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <Link href={`/cases/${row.id}`} className="font-medium hover:underline">
                {caseReference(row.id)}
              </Link>
              <span className="text-slate-600">{account.externalRef}</span>
              <span className="tabular-nums text-slate-600">risk {row.riskScore}</span>
              <span className="text-slate-500">
                {row.triggeredRules
                  .filter((rule) => rule.triggered)
                  .map((rule) => ruleLabel(rule.id))
                  .join(', ') || 'no rules triggered'}
              </span>
              <span className="ml-auto whitespace-nowrap text-slate-500">
                waiting {formatDuration(approval.createdAt, now)}
              </span>
            </div>

            <p className="mt-2 text-slate-600">
              <span className="font-medium text-slate-900">
                {RECOMMENDATION_LABELS[approval.recommendedResolution]}
              </span>{' '}
              recommended by {requester.name}
            </p>
            <p className="mt-0.5 text-slate-600">{approval.requesterReason}</p>

            <div className="mt-2 flex items-center gap-2">
              <Link
                href={`/cases/${row.id}`}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-100"
              >
                Open case
              </Link>
              <CaseActions
                kase={{
                  id: row.id,
                  version: row.version,
                  status: row.status,
                  assignedTo: row.assignedTo,
                  requiresSenior: row.requiresSenior,
                }}
                actor={{ id: currentUser.id, role: currentUser.role }}
                pendingApproval={{
                  id: approval.id,
                  version: approval.version,
                  requestedBy: approval.requestedBy,
                }}
              />
            </div>
          </li>
        ))}
        {pending.length === 0 && (
          <li className="rounded-md border border-slate-200 bg-white p-4 text-xs text-slate-500">
            Nothing awaiting approval.
          </li>
        )}
      </ul>
    </section>
  );
}
