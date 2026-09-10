import { describe, expect, it } from 'vitest';
import { filterAndSort, NO_FILTERS, summarize, type QueueRow } from '@/queue/view';

const ANALYST = 'user-analyst';

function row(overrides: Partial<QueueRow> & Pick<QueueRow, 'id'>): QueueRow {
  return {
    reference: `CASE-${overrides.id}`,
    accountRef: 'ACC-1000',
    riskScore: 0,
    flagged: false,
    rules: [],
    status: 'pending',
    open: true,
    assigneeId: null,
    assigneeName: null,
    createdAt: '2026-01-01 00:00Z',
    version: 1,
    ...overrides,
  };
}

const ROWS: QueueRow[] = [
  row({ id: 'closed-high', status: 'approved', open: false, riskScore: 95, flagged: true }),
  row({ id: 'old-flagged', riskScore: 80, flagged: true, createdAt: '2026-01-01 08:00Z' }),
  row({ id: 'new-flagged', riskScore: 80, flagged: true, createdAt: '2026-01-02 08:00Z' }),
  row({ id: 'top-flagged', riskScore: 85, flagged: true, rules: ['structuring'] }),
  row({
    id: 'mine',
    status: 'in_review',
    riskScore: 45,
    assigneeId: ANALYST,
    assigneeName: 'Xavier Warmerdam',
    rules: ['structuring'],
  }),
  row({ id: 'awaiting', status: 'escalated', riskScore: 40, assigneeId: 'user-senior' }),
  row({ id: 'clear', riskScore: 0, rules: [] }),
];

const ids = (rows: QueueRow[]) => rows.map((entry) => entry.id);

describe('queue summary', () => {
  it('counts the four operational figures independently of the filters', () => {
    expect(summarize(ROWS)).toEqual({
      open: 6,
      flagged: 4,
      awaitingApproval: 1,
      unassigned: 5,
    });
  });
});

describe('queue ordering', () => {
  it('puts open before closed, flagged before unflagged, then risk, then age', () => {
    expect(ids(filterAndSort(ROWS, NO_FILTERS, ANALYST))).toEqual([
      'top-flagged',
      'old-flagged',
      'new-flagged',
      'mine',
      'awaiting',
      'clear',
      'closed-high',
    ]);
  });

  it('ranks an open low-risk case above a closed high-risk one', () => {
    const sorted = filterAndSort(
      [
        row({ id: 'closed', open: false, status: 'approved', riskScore: 95, flagged: true }),
        row({ id: 'open', riskScore: 5 }),
      ],
      NO_FILTERS,
      ANALYST,
    );
    expect(ids(sorted)).toEqual(['open', 'closed']);
  });
});

describe('queue filters', () => {
  it('separates open and closed from the individual statuses', () => {
    expect(ids(filterAndSort(ROWS, { ...NO_FILTERS, status: 'closed' }, ANALYST))).toEqual([
      'closed-high',
    ]);
    expect(ids(filterAndSort(ROWS, { ...NO_FILTERS, status: 'escalated' }, ANALYST))).toEqual([
      'awaiting',
    ]);
  });

  it('filters by flag, rule and minimum risk', () => {
    expect(filterAndSort(ROWS, { ...NO_FILTERS, flag: 'unflagged' }, ANALYST)).toHaveLength(3);
    expect(ids(filterAndSort(ROWS, { ...NO_FILTERS, rule: 'structuring' }, ANALYST))).toEqual([
      'top-flagged',
      'mine',
    ]);
    expect(ids(filterAndSort(ROWS, { ...NO_FILTERS, minRisk: 85 }, ANALYST))).toEqual([
      'top-flagged',
      'closed-high',
    ]);
  });

  it('reads "mine" from the current user rather than from the row', () => {
    expect(ids(filterAndSort(ROWS, { ...NO_FILTERS, assignment: 'mine' }, ANALYST))).toEqual([
      'mine',
    ]);
    expect(filterAndSort(ROWS, { ...NO_FILTERS, assignment: 'mine' }, 'user-senior')).toHaveLength(
      1,
    );
    expect(filterAndSort(ROWS, { ...NO_FILTERS, assignment: 'unassigned' }, ANALYST)).toHaveLength(
      5,
    );
  });

  it('combines filters', () => {
    const filtered = filterAndSort(
      ROWS,
      { ...NO_FILTERS, status: 'open', flag: 'flagged', minRisk: 85 },
      ANALYST,
    );
    expect(ids(filtered)).toEqual(['top-flagged']);
  });
});
