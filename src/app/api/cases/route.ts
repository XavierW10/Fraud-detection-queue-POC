import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { parseQuery, respond } from '@/api/http';
import { id } from '@/api/schemas';
import { getCurrentUser } from '@/auth/currentUser';
import { getDb } from '@/db/client';
import { CASE_STATUSES } from '@/db/schema';
import { listCases } from '@/workflow/queries';

const querySchema = z.object({
  status: z.enum(CASE_STATUSES).optional(),
  /** `me` resolves to the current demo user, so the UI need not know its id. */
  assignedTo: id.optional(),
  requiresSenior: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export async function GET(request: NextRequest) {
  return respond(async () => {
    const query = parseQuery(querySchema, new URL(request.url));
    const db = getDb();
    const actor = await getCurrentUser(db);

    return {
      currentUser: actor,
      cases: listCases(db, {
        status: query.status,
        assignedTo: query.assignedTo === 'me' ? actor.id : query.assignedTo,
        requiresSenior: query.requiresSenior,
      }),
    };
  });
}
