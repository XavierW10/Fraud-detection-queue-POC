import type { ApiError } from '@/api/http';
import type { CaseResolution, RecommendedResolution } from '@/db/schema';

/**
 * Browser-side calls to the route handlers. Mutations go over HTTP rather than
 * through a Server Function so the UI exercises the same contract any other
 * client would, including the `{ error: { code, message } }` body — a refusal
 * or a stale version is a value the caller renders, never a thrown error.
 */
export type ApiResult = { ok: true } | { ok: false; code: string; message: string };

async function post(url: string, body: unknown): Promise<ApiResult> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, code: 'network_error', message: 'Could not reach the server.' };
  }

  if (response.ok) return { ok: true };

  const payload: unknown = await response.json().catch(() => null);
  const error = (payload as ApiError | null)?.error;
  return {
    ok: false,
    code: error?.code ?? 'internal_error',
    message: error?.message ?? `Request failed (${response.status}).`,
  };
}

export const caseApi = {
  claim: (caseId: string, expectedVersion: number) =>
    post(`/api/cases/${caseId}/claim`, { expectedVersion }),

  resolve: (
    caseId: string,
    input: { expectedVersion: number; resolution: CaseResolution; rationale: string },
  ) => post(`/api/cases/${caseId}/decision`, input),

  requestApproval: (
    caseId: string,
    input: {
      expectedVersion: number;
      recommendedResolution: RecommendedResolution;
      requesterReason: string;
    },
  ) => post(`/api/cases/${caseId}/request-approval`, input),

  decideApproval: (
    approvalId: string,
    input: {
      expectedApprovalVersion: number;
      expectedCaseVersion: number;
      decision: 'approve' | 'return';
      reason: string;
    },
  ) => post(`/api/approvals/${approvalId}/decision`, input),
};
