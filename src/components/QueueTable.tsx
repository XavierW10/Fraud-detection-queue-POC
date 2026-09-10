'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { caseApi } from '@/api/client';
import { CASE_STATUS_LABELS } from '@/components/labels';
import { CASE_STATUSES } from '@/db/schema';
import {
  filterAndSort,
  NO_FILTERS,
  summarize,
  type QueueFilters,
  type QueueRow,
} from '@/queue/view';

export function QueueTable({ rows, currentUserId }: { rows: QueueRow[]; currentUserId: string }) {
  const router = useRouter();
  const [filters, setFilters] = useState<QueueFilters>(NO_FILTERS);
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);
  const [claiming, startClaim] = useTransition();

  const set = <K extends keyof QueueFilters>(key: K, value: QueueFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));
  /** A card is a shortcut to one view, so it clears whatever else was set. */
  const only = <K extends keyof QueueFilters>(key: K, value: QueueFilters[K]) =>
    setFilters({ ...NO_FILTERS, [key]: value });

  const ruleOptions = useMemo(() => [...new Set(rows.flatMap((row) => row.rules))].sort(), [rows]);
  const visible = useMemo(
    () => filterAndSort(rows, filters, currentUserId),
    [rows, filters, currentUserId],
  );
  const counts = summarize(rows);

  const claim = (row: QueueRow) => {
    setFailure(null);
    startClaim(async () => {
      const result = await caseApi.claim(row.id, row.version);
      if (result.ok) router.refresh();
      else setFailure({ id: row.id, message: result.message });
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label="Open cases" value={counts.open} onClick={() => only('status', 'open')} />
        <Card
          label="Flagged cases"
          value={counts.flagged}
          onClick={() => only('flag', 'flagged')}
        />
        <Card
          label="Awaiting approval"
          value={counts.awaitingApproval}
          onClick={() => only('status', 'escalated')}
        />
        <Card
          label="Unassigned cases"
          value={counts.unassigned}
          onClick={() => only('assignment', 'unassigned')}
        />
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-white p-3">
        <Field label="Status">
          <select
            className={selectClass}
            value={filters.status}
            onChange={(event) => set('status', event.target.value as QueueFilters['status'])}
          >
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            {CASE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {CASE_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Flag">
          <select
            className={selectClass}
            value={filters.flag}
            onChange={(event) => set('flag', event.target.value as QueueFilters['flag'])}
          >
            <option value="all">All</option>
            <option value="flagged">Flagged</option>
            <option value="unflagged">Not flagged</option>
          </select>
        </Field>

        <Field label="Triggered rule">
          <select
            className={selectClass}
            value={filters.rule}
            onChange={(event) => set('rule', event.target.value)}
          >
            <option value="all">Any</option>
            {ruleOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Assignment">
          <select
            className={selectClass}
            value={filters.assignment}
            onChange={(event) =>
              set('assignment', event.target.value as QueueFilters['assignment'])
            }
          >
            <option value="all">All</option>
            <option value="mine">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </Field>

        <Field label={`Minimum risk: ${filters.minRisk}`}>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={filters.minRisk}
            onChange={(event) => set('minRisk', Number(event.target.value))}
            className="w-32"
          />
        </Field>

        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          <span>
            {visible.length} of {rows.length}
          </span>
          <button
            type="button"
            onClick={() => setFilters(NO_FILTERS)}
            className="rounded-md px-2 py-1 hover:bg-slate-100"
          >
            Clear filters
          </button>
        </div>
      </div>

      <table className="w-full border-separate border-spacing-0 overflow-hidden rounded-md border border-slate-200 bg-white text-xs">
        <thead className="bg-slate-100 text-left text-slate-600">
          <tr>
            <Th>Case</Th>
            <Th>Account</Th>
            <Th className="text-right">Score</Th>
            <Th>Flag</Th>
            <Th>Triggered rules</Th>
            <Th>Status</Th>
            <Th>Analyst</Th>
            <Th>Created</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr key={row.id} className="border-t border-slate-100 align-top">
              <Td className="font-medium">
                <Link href={`/cases/${row.id}`} className="hover:underline">
                  {row.reference}
                </Link>
                {failure?.id === row.id && (
                  <p className="mt-1 font-normal text-rose-600">{failure.message}</p>
                )}
              </Td>
              <Td>{row.accountRef}</Td>
              <Td className="text-right tabular-nums">{row.riskScore}</Td>
              <Td>
                {row.flagged ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                    Flagged
                  </span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </Td>
              <Td className="text-slate-600">{row.rules.join(', ') || '—'}</Td>
              <Td>{CASE_STATUS_LABELS[row.status]}</Td>
              <Td className={row.assigneeName ? '' : 'text-slate-400'}>
                {row.assigneeName ?? 'Unassigned'}
              </Td>
              <Td className="whitespace-nowrap text-slate-500">{row.createdAt}</Td>
              <Td className="text-right whitespace-nowrap">
                <Link
                  href={`/cases/${row.id}`}
                  className="rounded-md px-2 py-1 text-slate-700 hover:bg-slate-100"
                >
                  Open
                </Link>
                {row.status === 'pending' && row.assigneeId === null && (
                  <button
                    type="button"
                    disabled={claiming}
                    onClick={() => claim(row)}
                    className="ml-1 rounded-md bg-slate-900 px-2 py-1 text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    Claim
                  </button>
                )}
              </Td>
            </tr>
          ))}
          {visible.length === 0 && (
            <tr>
              <td className="px-3 py-6 text-center text-slate-500" colSpan={9}>
                No cases match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const selectClass = 'rounded-md border border-slate-300 bg-white px-2 py-1 text-xs';

function Card({ label, value, onClick }: { label: string; value: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-slate-200 bg-white p-3 text-left hover:border-slate-400"
    >
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-500">
      {label}
      {children}
    </label>
  );
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 font-medium ${className}`}>{children}</th>;
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}
