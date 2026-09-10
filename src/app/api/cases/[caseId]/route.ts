import { parseParams, respondCacheable } from '@/api/http';
import { caseParams } from '@/api/schemas';
import { getCurrentUser } from '@/auth/currentUser';
import { getDb } from '@/db/client';
import { getCaseDetail } from '@/workflow/queries';

export async function GET(request: Request, context: RouteContext<'/api/cases/[caseId]'>) {
  return respondCacheable(request, async () => {
    const { caseId } = parseParams(caseParams, await context.params);
    const db = getDb();
    return { currentUser: await getCurrentUser(db), ...getCaseDetail(db, caseId) };
  });
}
