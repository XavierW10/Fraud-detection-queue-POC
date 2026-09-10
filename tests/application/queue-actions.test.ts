import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cases } from '@/db/schema';
import { CASE_IDS } from '@/db/seed-data';
import { harnessFor, type App } from './harness';

const app = vi.hoisted(() => ({}) as App);

vi.mock('@/db/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/db/client')>();
  return { ...original, getDb: () => app.db };
});

vi.mock('@/auth/currentUser', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/auth/currentUser')>();
  return { ...original, getCurrentUser: async () => app.actor };
});

vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

const { analyst, db, start, stop } = harnessFor(app);

beforeEach(start);
afterEach(stop);

const caseRow = (id: string) => db().select().from(cases).where(eq(cases.id, id)).get()!;

describe('claim from the queue', () => {
  it('assigns the case to the acting analyst', async () => {
    const { claimCaseAction } = await import('@/app/actions');

    expect(await claimCaseAction(CASE_IDS.clear, caseRow(CASE_IDS.clear).version)).toEqual({
      ok: true,
    });

    const claimed = caseRow(CASE_IDS.clear);
    expect([claimed.status, claimed.assignedTo]).toEqual(['in_review', analyst().id]);
  });

  it('returns a stale claim as a conflict instead of throwing', async () => {
    const { claimCaseAction } = await import('@/app/actions');
    const stale = caseRow(CASE_IDS.clear).version;
    await claimCaseAction(CASE_IDS.clear, stale);

    const result = await claimCaseAction(CASE_IDS.clear, stale);

    expect(result).toMatchObject({ ok: false, code: 'conflict' });
    expect(caseRow(CASE_IDS.clear).assignedTo).toEqual(analyst().id);
  });
});
