'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { DEMO_USER_COOKIE, listDemoUsers } from '@/auth/currentUser';
import { getDb } from '@/db/client';
import { WorkflowError } from '@/workflow/errors';

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
