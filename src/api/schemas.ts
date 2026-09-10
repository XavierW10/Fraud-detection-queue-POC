import { z } from 'zod';
import { CASE_RESOLUTIONS, RECOMMENDED_RESOLUTIONS } from '@/db/schema';

/** Every mutating call carries the version it read, for compare-and-swap. */
const expectedVersion = z.int().positive();
const reason = z.string().min(1);

/** Ids are opaque strings; whether one exists is the database's answer, not a format's. */
export const id = z.string().min(1);

export const caseParams = z.object({ caseId: id });
export const approvalParams = z.object({ approvalId: id });

export const claimBody = z.object({ expectedVersion });

export const decisionBody = z.object({
  expectedVersion,
  resolution: z.enum(CASE_RESOLUTIONS),
  rationale: reason,
});

export const requestApprovalBody = z.object({
  expectedVersion,
  recommendedResolution: z.enum(RECOMMENDED_RESOLUTIONS),
  requesterReason: reason,
});

/** Both versions, because the decision writes the approval and its case. */
export const approvalDecisionBody = z.object({
  expectedApprovalVersion: expectedVersion,
  expectedCaseVersion: expectedVersion,
  decision: z.enum(['approve', 'return']),
  reason,
});
