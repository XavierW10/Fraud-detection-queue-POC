import type Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { createTestDb, type Db } from '@/db/client';
import { accounts, cases, users, type Case, type User } from '@/db/schema';
import { seedDatabase } from '@/db/seed';
import { USER_IDS } from '@/db/seed-data';

/**
 * Application-level harness: the real seeded database behind the real route
 * handlers, with only the two edges a server provides — the database handle and
 * the cookie-bound demo user — supplied by the test. Everything else (policy,
 * permissions, transactions, audit trail) runs as it does in production.
 *
 * Test files own the two `vi.mock` calls, since mock factories are hoisted per
 * file, and hand their `App` here so the mocks and the harness share one
 * database. The mocks must not import this module: it imports theirs.
 */
export type App = { db: Db; sqlite: Database.Database; actor: User };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = any;

/** Every call returns `[status, body]`, so refusals read as plainly as successes. */
export type Result = [number, Json];

/** Handlers load on first call: importing them at module load would run the mocks too early. */
const routes = {
  cases: () => import('@/app/api/cases/route'),
  case: () => import('@/app/api/cases/[caseId]/route'),
  claim: () => import('@/app/api/cases/[caseId]/claim/route'),
  decision: () => import('@/app/api/cases/[caseId]/decision/route'),
  requestApproval: () => import('@/app/api/cases/[caseId]/request-approval/route'),
  approvals: () => import('@/app/api/approvals/route'),
  approvalDecision: () => import('@/app/api/approvals/[approvalId]/decision/route'),
  policy: () => import('@/app/api/policy/route'),
};

const request = (url = 'http://localhost', headers?: HeadersInit) =>
  new Request(url, { headers }) as never;
const body = (payload: unknown) =>
  new Request('http://localhost', { method: 'POST', body: JSON.stringify(payload) });
const route = <T extends object>(params: T) => ({ params: Promise.resolve(params) }) as never;

const result = async (response: Response): Promise<Result> => [
  response.status,
  response.status === 304 ? null : await response.json(),
];

export const api = {
  cases: async (query = ''): Promise<Result> =>
    result(await (await routes.cases()).GET(request(`http://localhost/api/cases${query}`))),

  case: async (caseId: string): Promise<Result> =>
    result(await (await routes.case()).GET(request(), route({ caseId }))),

  /** The raw response, for the reads whose headers are the thing under test. */
  raw: {
    cases: async (query = '', headers?: HeadersInit): Promise<Response> =>
      (await routes.cases()).GET(request(`http://localhost/api/cases${query}`, headers)),

    case: async (caseId: string, headers?: HeadersInit): Promise<Response> =>
      (await routes.case()).GET(request('http://localhost', headers), route({ caseId })),
  },

  claim: async (caseId: string, expectedVersion: number): Promise<Result> =>
    result(await (await routes.claim()).POST(body({ expectedVersion }), route({ caseId }))),

  decide: async (caseId: string, payload: unknown): Promise<Result> =>
    result(await (await routes.decision()).POST(body(payload), route({ caseId }))),

  requestApproval: async (caseId: string, payload: unknown): Promise<Result> =>
    result(await (await routes.requestApproval()).POST(body(payload), route({ caseId }))),

  approvals: async (query = ''): Promise<Result> =>
    result(await (await routes.approvals()).GET(request(`http://localhost/api/approvals${query}`))),

  decideApproval: async (approvalId: string, payload: unknown): Promise<Result> =>
    result(await (await routes.approvalDecision()).POST(body(payload), route({ approvalId }))),

  policy: async (): Promise<Result> => result(await (await routes.policy()).GET()),
};

/** Binds the harness to the state object a test file shares with its mocks. */
export function harnessFor(app: App) {
  const user = (id: string) => app.db.select().from(users).where(eq(users.id, id)).get()!;

  return {
    api,

    /** A seeded in-memory database per test, held by the analyst. */
    start(): void {
      Object.assign(app, createTestDb());
      seedDatabase(app.db);
      app.actor = user(USER_IDS.analyst);
    },

    stop(): void {
      app.sqlite.close();
    },

    db: (): Db => app.db,
    sqlite: (): Database.Database => app.sqlite,

    analyst: (): User => user(USER_IDS.analyst),
    senior: (): User => user(USER_IDS.senior),
    actAs: (who: User): void => void (app.actor = who),

    /** A fresh above-threshold case, since every seeded flagged case is mid-flight. */
    newFlaggedCase(externalRef: string): Case {
      const account = app.db
        .insert(accounts)
        .values({ externalRef, status: 'flagged' })
        .returning()
        .get();

      return app.db
        .insert(cases)
        .values({
          accountId: account.id,
          policyVersion: 'aml-transaction-monitoring-policy@1.0.0',
          riskScore: 80,
          requiresSenior: true,
          triggeredRules: [],
        })
        .returning()
        .get();
    },
  };
}
