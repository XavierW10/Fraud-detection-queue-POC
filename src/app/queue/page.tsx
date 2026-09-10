import { getCurrentUser } from '@/auth/currentUser';
import { ROLE_LABELS } from '@/components/labels';
import { QueueTable } from '@/components/QueueTable';
import { caseReference, formatTimestamp } from '@/components/format';
import { getDb } from '@/db/client';
import type { QueueRow } from '@/queue/view';
import { listCases } from '@/workflow/queries';
import { isClosed } from '@/workflow/transitions';

/** The whole demo queue is small, and filtering happens in the browser. */
const PAGE_SIZE = 100;

export default async function QueuePage() {
  const db = getDb();
  const currentUser = await getCurrentUser(db);
  const { cases, page } = listCases(db, {}, { limit: PAGE_SIZE, offset: 0 });

  const rows: QueueRow[] = cases.map(({ case: row, account, assignee }) => ({
    id: row.id,
    reference: caseReference(row.id),
    accountRef: account.externalRef,
    riskScore: row.riskScore,
    // "Flagged" is the policy's own answer: the score reached the threshold.
    flagged: row.requiresSenior,
    rules: row.triggeredRules.filter((rule) => rule.triggered).map((rule) => rule.id),
    status: row.status,
    // Open vs closed is the state machine's answer, not a second list of statuses.
    open: !isClosed(row.status),
    assigneeId: assignee?.id ?? null,
    assigneeName: assignee?.name ?? null,
    createdAt: formatTimestamp(row.createdAt),
    version: row.version,
  }));

  return (
    <section>
      <header className="mb-4 flex items-baseline gap-3">
        <h1 className="text-base font-semibold">Review queue</h1>
        <p className="text-xs text-slate-500">
          {page.total} case{page.total === 1 ? '' : 's'} · as {ROLE_LABELS[currentUser.role]}
        </p>
      </header>

      <QueueTable rows={rows} currentUserId={currentUser.id} />
    </section>
  );
}
