import { getCurrentUser } from '@/auth/currentUser';
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

  const pending = listApprovals(db, { status: 'pending' });

  return (
    <section>
      <header className="mb-4 flex items-baseline gap-3">
        <h1 className="text-base font-semibold">Approval requests</h1>
        <p className="text-xs text-slate-500">{pending.length} awaiting a decision</p>
      </header>

      <ul className="space-y-2">
        {pending.map(({ approval, account, case: row, requester }) => (
          <li key={approval.id} className="rounded-md border border-slate-200 bg-white p-3">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-medium">{account.externalRef}</span>
              <span className="text-[11px] text-slate-500">
                risk {row.riskScore} · recommends {approval.recommendedResolution.replace('_', ' ')}
              </span>
              <span className="ml-auto text-[11px] text-slate-500">
                requested by {requester.name}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-600">{approval.requesterReason}</p>
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
