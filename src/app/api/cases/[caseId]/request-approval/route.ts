import { parseBody, parseParams, respond } from '@/api/http';
import { caseParams, requestApprovalBody } from '@/api/schemas';
import { getCurrentUser } from '@/auth/currentUser';
import { getDb } from '@/db/client';
import { assertRoleAllowed } from '@/workflow/permissions';
import { requestApproval } from '@/workflow/service';

export async function POST(
  request: Request,
  context: RouteContext<'/api/cases/[caseId]/request-approval'>,
) {
  return respond(async () => {
    const { caseId } = parseParams(caseParams, await context.params);
    const body = await parseBody(requestApprovalBody, request);
    const db = getDb();
    const actor = await getCurrentUser(db);
    assertRoleAllowed('request_approval', actor);

    const result = requestApproval(db, {
      caseId,
      actor,
      expectedVersion: body.expectedVersion,
      recommendedResolution: body.recommendedResolution,
      requesterReason: body.requesterReason,
    });

    return { case: result.case, approval: result.approval };
  });
}
