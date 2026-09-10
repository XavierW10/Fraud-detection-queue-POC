import { parseBody, parseParams, respond } from '@/api/http';
import { approvalDecisionBody, approvalParams } from '@/api/schemas';
import { getCurrentUser } from '@/auth/currentUser';
import { getDb } from '@/db/client';
import { assertRoleAllowed } from '@/workflow/permissions';
import { decideApproval } from '@/workflow/service';

export async function POST(
  request: Request,
  context: RouteContext<'/api/approvals/[approvalId]/decision'>,
) {
  return respond(async () => {
    const { approvalId } = parseParams(approvalParams, await context.params);
    const body = await parseBody(approvalDecisionBody, request);
    const db = getDb();
    const actor = await getCurrentUser(db);
    // Non-seniors are refused here, before the approval is even read.
    assertRoleAllowed('decide_approval', actor);

    return decideApproval(db, {
      approvalId,
      actor,
      decision: body.decision,
      reason: body.reason,
      expectedApprovalVersion: body.expectedApprovalVersion,
      expectedCaseVersion: body.expectedCaseVersion,
    });
  });
}
