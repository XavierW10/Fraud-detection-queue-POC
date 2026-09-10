import { parseBody, parseParams, respond } from '@/api/http';
import { caseParams, claimBody } from '@/api/schemas';
import { getCurrentUser } from '@/auth/currentUser';
import { getDb } from '@/db/client';
import { assertRoleAllowed } from '@/workflow/permissions';
import { claimCase } from '@/workflow/service';

export async function POST(request: Request, context: RouteContext<'/api/cases/[caseId]/claim'>) {
  return respond(async () => {
    const { caseId } = parseParams(caseParams, await context.params);
    const body = await parseBody(claimBody, request);
    const db = getDb();
    const actor = await getCurrentUser(db);
    assertRoleAllowed('claim', actor);

    return { case: claimCase(db, { caseId, actor, expectedVersion: body.expectedVersion }) };
  });
}
