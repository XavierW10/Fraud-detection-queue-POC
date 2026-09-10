import { parseBody, parseParams, respond } from '@/api/http';
import { caseParams, decisionBody } from '@/api/schemas';
import { getCurrentUser } from '@/auth/currentUser';
import { getDb } from '@/db/client';
import { assertRoleAllowed } from '@/workflow/permissions';
import { resolveCase } from '@/workflow/service';

/** Direct resolution. Whether this actor may close *this* case is the service's call. */
export async function POST(
  request: Request,
  context: RouteContext<'/api/cases/[caseId]/decision'>,
) {
  return respond(async () => {
    const { caseId } = parseParams(caseParams, await context.params);
    const body = await parseBody(decisionBody, request);
    const db = getDb();
    const actor = await getCurrentUser(db);
    assertRoleAllowed('resolve', actor);

    return {
      case: resolveCase(db, {
        caseId,
        actor,
        expectedVersion: body.expectedVersion,
        resolution: body.resolution,
        rationale: body.rationale,
      }),
    };
  });
}
