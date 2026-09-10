import { asc, eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { getDb, type DbLike } from '@/db/client';
import { users, type User } from '@/db/schema';
import { WorkflowError } from '@/workflow/errors';

/** Simulated auth: the demo user is whoever this cookie names. */
export const DEMO_USER_COOKIE = 'demo_user_id';

/** Everyone the "act as" switcher can offer, in seed order. */
export function listDemoUsers(db: DbLike): User[] {
  return db.select().from(users).orderBy(asc(users.createdAt)).all();
}

/**
 * The role always comes from the database — a cookie only names a user, it can
 * never assert what that user may do. An unknown or missing cookie falls back
 * to the seeded reviewer, the least privileged demo user.
 */
export function resolveCurrentUser(db: DbLike, demoUserId: string | undefined): User {
  const named = demoUserId
    ? db.select().from(users).where(eq(users.id, demoUserId)).get()
    : undefined;
  if (named) return named;

  const candidates = listDemoUsers(db);
  const fallback = candidates.find((user) => user.role === 'reviewer') ?? candidates[0];
  if (!fallback) throw new WorkflowError('not_found', 'No demo users are seeded');
  return fallback;
}

export async function getCurrentUser(db: DbLike = getDb()): Promise<User> {
  const cookieStore = await cookies();
  return resolveCurrentUser(db, cookieStore.get(DEMO_USER_COOKIE)?.value);
}
