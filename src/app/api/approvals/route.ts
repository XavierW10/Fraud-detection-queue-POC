import { z } from 'zod';
import type { NextRequest } from 'next/server';
import { parseQuery, respondCacheable } from '@/api/http';
import { id } from '@/api/schemas';
import { getCurrentUser } from '@/auth/currentUser';
import { getDb } from '@/db/client';
import { APPROVAL_STATUSES } from '@/db/schema';
import { listApprovals } from '@/workflow/queries';

const querySchema = z.object({
  status: z.enum(APPROVAL_STATUSES).optional(),
  caseId: id.optional(),
});

export async function GET(request: NextRequest) {
  return respondCacheable(request, async () => {
    const query = parseQuery(querySchema, new URL(request.url));
    const db = getDb();

    return {
      currentUser: await getCurrentUser(db),
      approvals: listApprovals(db, query),
    };
  });
}
