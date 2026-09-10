import Link from 'next/link';
import { getCurrentUser } from '@/auth/currentUser';
import { ACCOUNT_STATUS_LABELS, CASE_STATUS_LABELS, ROLE_LABELS } from '@/components/labels';
import { getDb } from '@/db/client';
import { listCases } from '@/workflow/queries';

const PAGE_SIZE = 25;

export default async function QueuePage({ searchParams }: PageProps<'/queue'>) {
  const { mine } = await searchParams;
  const db = getDb();
  const currentUser = await getCurrentUser(db);

  const { cases, page } = listCases(db, mine === '1' ? { assignedTo: currentUser.id } : {}, {
    limit: PAGE_SIZE,
    offset: 0,
  });

  return (
    <section>
      <header className="mb-4 flex items-baseline gap-3">
        <h1 className="text-base font-semibold">Review queue</h1>
        <p className="text-xs text-slate-500">
          {page.total} case{page.total === 1 ? '' : 's'} · as {ROLE_LABELS[currentUser.role]}
        </p>
        <nav className="ml-auto flex gap-1 text-xs">
          <Filter href="/queue" label="All" active={mine !== '1'} />
          <Filter href="/queue?mine=1" label="Assigned to me" active={mine === '1'} />
        </nav>
      </header>

      <table className="w-full border-separate border-spacing-0 overflow-hidden rounded-md border border-slate-200 bg-white text-xs">
        <thead className="bg-slate-100 text-left text-slate-600">
          <tr>
            <Th>Account</Th>
            <Th>Account status</Th>
            <Th>Case status</Th>
            <Th className="text-right">Risk</Th>
            <Th>Rules</Th>
            <Th>Assignee</Th>
          </tr>
        </thead>
        <tbody>
          {cases.map(({ case: row, account, assignee }) => (
            <tr key={row.id} className="border-t border-slate-100">
              <Td className="font-medium">{account.externalRef}</Td>
              <Td>{ACCOUNT_STATUS_LABELS[account.status]}</Td>
              <Td>{CASE_STATUS_LABELS[row.status]}</Td>
              <Td className="text-right tabular-nums">
                {row.riskScore}
                {row.requiresSenior && (
                  <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">
                    senior
                  </span>
                )}
              </Td>
              <Td className="text-slate-600">
                {row.triggeredRules
                  .filter((rule) => rule.triggered)
                  .map((rule) => rule.id)
                  .join(', ') || '—'}
              </Td>
              <Td className={assignee?.name ? '' : 'text-slate-400'}>
                {assignee?.name ?? 'Unassigned'}
              </Td>
            </tr>
          ))}
          {cases.length === 0 && (
            <tr>
              <td className="px-3 py-6 text-center text-slate-500" colSpan={6}>
                No cases match this view.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function Filter({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-md px-2 py-1 ${
        active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {label}
    </Link>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 font-medium ${className}`}>{children}</th>;
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}
