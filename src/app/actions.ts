'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { DEMO_USER_COOKIE, getCurrentUser, listDemoUsers } from '@/auth/currentUser';
import { getDb } from '@/db/client';
import { WorkflowError, type WorkflowErrorCode } from '@/workflow/errors';
import { claimCase } from '@/workflow/service';

/**
 * Actions return their failure instead of throwing it: a refusal or a stale
 * version is an expected answer the queue has to render, not an error page.
 */
export type ActionResult =
  { ok: true } | { ok: false; code: WorkflowErrorCode | 'unknown'; message: string };

/**
 * The demo's "act as" switch. The cookie only names a user — every permission
 * is still read from the database — but an id that names nobody is refused so
 * the app can never run as a user that does not exist.
 */
export async function switchPersona(userId: string): Promise<void> {
  const known = listDemoUsers(getDb()).some((user) => user.id === userId);
  if (!known) throw new WorkflowError('not_found', `No demo user ${userId}`);

  (await cookies()).set(DEMO_USER_COOKIE, userId, { path: '/', sameSite: 'lax' });
  // Every page is read as the current user, so the whole tree is stale.
  revalidatePath('/', 'layout');
}

/**
 * Claim from the queue. The version the row was rendered with is sent back, so
 * a case someone else has already taken fails as a conflict rather than
 * silently reassigning itself.
 */
export async function claimCaseAction(
  caseId: string,
  expectedVersion: number,
): Promise<ActionResult> {
  const db = getDb();
  try {
    claimCase(db, { caseId, actor: await getCurrentUser(db), expectedVersion });
  } catch (error) {
    return asResult(error);
  }
  revalidatePath('/queue');
  revalidatePath(`/cases/${caseId}`);
  return { ok: true };
}

function asResult(error: unknown): ActionResult {
  if (error instanceof WorkflowError)
    return { ok: false, code: error.code, message: error.message };
  return { ok: false, code: 'unknown', message: 'Something went wrong. Reload and try again.' };
}
