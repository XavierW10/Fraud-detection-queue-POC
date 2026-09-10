import { and, eq } from 'drizzle-orm';
import { insertAuditEvent, statusBeforeChangeTo } from '@/db/audit';
import type { Db, DbLike } from '@/db/client';
import {
  accounts,
  approvals,
  cases,
  type AccountStatus,
  type Approval,
  type Case,
  type CaseResolution,
  type CaseStatus,
  type RecommendedResolution,
  type User,
} from '@/db/schema';
import { WorkflowError } from './errors';
import { assertPermitted } from './permissions';
import { assertTransition } from './transitions';

/**
 * Every service below runs in a single transaction: the record change and the
 * audit rows it produces commit together or not at all. Callers pass the
 * version they read, so a stale write is rejected instead of overwriting a
 * concurrent decision.
 */

const CASE_STATUS_FOR_RESOLUTION: Record<CaseResolution, CaseStatus> = {
  approved: 'approved',
  rejected: 'rejected',
  confirmed_fraud: 'rejected',
};

const ACCOUNT_STATUS_FOR_RESOLUTION: Record<CaseResolution, AccountStatus> = {
  approved: 'cleared',
  rejected: 'confirmed_fraud',
  confirmed_fraud: 'confirmed_fraud',
};

const RESOLUTION_FOR_RECOMMENDATION: Record<RecommendedResolution, CaseResolution> = {
  approve: 'approved',
  reject: 'rejected',
  confirm_fraud: 'confirmed_fraud',
};

export type ClaimInput = {
  caseId: string;
  actor: User;
  expectedVersion: number;
};

export type ResolveInput = ClaimInput & {
  resolution: CaseResolution;
  rationale: string;
};

export type RequestApprovalInput = ClaimInput & {
  recommendedResolution: RecommendedResolution;
  requesterReason: string;
};

export type DecideApprovalInput = {
  approvalId: string;
  actor: User;
  decision: 'approve' | 'return';
  reason: string;
  expectedApprovalVersion: number;
  expectedCaseVersion: number;
};

/** Pending, unassigned -> in review, owned and soft-locked by the claimant. */
export function claimCase(db: Db, input: ClaimInput): Case {
  return db.transaction((tx) => {
    const kase = loadCase(tx, input.caseId);
    assertVersion('Case', kase.version, input.expectedVersion);
    assertPermitted('claim', { actor: input.actor, case: kase });
    assertTransition(kase.status, 'in_review');

    const now = new Date();
    const claimed = updateCase(tx, kase, {
      status: 'in_review',
      assignedTo: input.actor.id,
      lockedBy: input.actor.id,
      lockedAt: now,
    });
    insertAuditEvent(tx, {
      caseId: kase.id,
      actorId: input.actor.id,
      action: 'open',
      fromStatus: kase.status,
      toStatus: claimed.status,
    });
    return claimed;
  });
}

/**
 * Direct resolution. Permitted below the threshold for the assigned reviewer,
 * and above it only for a senior — an analyst must request approval instead.
 */
export function resolveCase(db: Db, input: ResolveInput): Case {
  return db.transaction((tx) => {
    const kase = loadCase(tx, input.caseId);
    assertVersion('Case', kase.version, input.expectedVersion);
    assertPermitted('resolve', { actor: input.actor, case: kase });
    assertNoPendingApproval(tx, kase);
    return closeCase(tx, {
      kase,
      actor: input.actor,
      resolution: input.resolution,
      rationale: requireReason(input.rationale, 'A rationale'),
    });
  });
}

/** In review -> awaiting approval, recording the reviewer's recommendation. */
export function requestApproval(
  db: Db,
  input: RequestApprovalInput,
): { case: Case; approval: Approval } {
  return db.transaction((tx) => {
    const kase = loadCase(tx, input.caseId);
    assertVersion('Case', kase.version, input.expectedVersion);
    assertPermitted('request_approval', { actor: input.actor, case: kase });
    assertTransition(kase.status, 'escalated');

    const approval = tx
      .insert(approvals)
      .values({
        caseId: kase.id,
        recommendedResolution: input.recommendedResolution,
        requesterReason: requireReason(input.requesterReason, 'A reason'),
        status: 'pending',
        requestedBy: input.actor.id,
      })
      .returning()
      .get();

    const escalated = updateCase(tx, kase, { status: 'escalated' });
    insertAuditEvent(tx, {
      caseId: kase.id,
      actorId: input.actor.id,
      action: 'escalate',
      fromStatus: kase.status,
      toStatus: escalated.status,
    });
    insertAuditEvent(tx, {
      caseId: kase.id,
      actorId: input.actor.id,
      action: 'request_approval',
    });
    setAccountStatus(tx, kase, input.actor.id, 'under_review');

    return { case: escalated, approval };
  });
}

/**
 * The senior decision: approve to close the case on the recommended
 * resolution, or return it to the reviewer for more work.
 */
export function decideApproval(
  db: Db,
  input: DecideApprovalInput,
): { case: Case; approval: Approval } {
  return db.transaction((tx) => {
    const approval = tx.select().from(approvals).where(eq(approvals.id, input.approvalId)).get();
    if (!approval) throw new WorkflowError('not_found', `No approval ${input.approvalId}`);
    if (approval.status !== 'pending') {
      throw new WorkflowError('conflict', 'Approval request has already been decided');
    }
    assertVersion('Approval', approval.version, input.expectedApprovalVersion);

    const kase = loadCase(tx, approval.caseId);
    assertVersion('Case', kase.version, input.expectedCaseVersion);
    assertPermitted('decide_approval', { actor: input.actor, case: kase, approval });

    const reason = requireReason(input.reason, 'A decision reason');
    const now = new Date();
    const decided = tx
      .update(approvals)
      .set({
        status: input.decision === 'approve' ? 'approved' : 'rejected',
        seniorDecisionReason: reason,
        decidedBy: input.actor.id,
        decidedAt: now,
        updatedAt: now,
        version: approval.version + 1,
      })
      .where(eq(approvals.id, approval.id))
      .returning()
      .get();

    if (input.decision === 'return') {
      assertTransition(kase.status, 'in_review');
      const returned = updateCase(tx, kase, { status: 'in_review' });
      insertAuditEvent(tx, {
        caseId: kase.id,
        actorId: input.actor.id,
        action: 'return_to_review',
        fromStatus: kase.status,
        toStatus: returned.status,
      });
      // The escalation put the account under review; returning the case undoes it.
      setAccountStatus(
        tx,
        kase,
        input.actor.id,
        (current) => statusBeforeChangeTo(tx, kase.id, 'under_review') ?? current,
      );
      return { case: returned, approval: decided };
    }

    const closed = closeCase(tx, {
      kase,
      actor: input.actor,
      resolution: RESOLUTION_FOR_RECOMMENDATION[approval.recommendedResolution],
      rationale: reason,
    });
    return { case: closed, approval: decided };
  });
}

function closeCase(
  tx: DbLike,
  args: { kase: Case; actor: User; resolution: CaseResolution; rationale: string },
): Case {
  const { kase, actor, resolution, rationale } = args;
  const target = CASE_STATUS_FOR_RESOLUTION[resolution];
  assertTransition(kase.status, target);

  const closed = updateCase(tx, kase, {
    status: target,
    resolution,
    rationale,
    resolvedAt: new Date(),
    lockedBy: null,
    lockedAt: null,
  });
  insertAuditEvent(tx, {
    caseId: kase.id,
    actorId: actor.id,
    action: target === 'approved' ? 'approve' : 'reject',
    fromStatus: kase.status,
    toStatus: closed.status,
  });
  setAccountStatus(tx, kase, actor.id, (current) =>
    // Clearing a case is not an intel finding: a known-bad account stays known bad.
    resolution === 'approved' && current === 'known_bad'
      ? current
      : ACCOUNT_STATUS_FOR_RESOLUTION[resolution],
  );
  return closed;
}

/**
 * A pending request owns the outcome: closing the case around it would leave
 * the request in the senior's queue against a case that can no longer move.
 */
function assertNoPendingApproval(tx: DbLike, kase: Case): void {
  const pending = tx
    .select({ id: approvals.id })
    .from(approvals)
    .where(and(eq(approvals.caseId, kase.id), eq(approvals.status, 'pending')))
    .get();
  if (!pending) return;

  throw new WorkflowError(
    'conflict',
    'An approval request is pending on this case; it is decided through the approval, not directly',
  );
}

function loadCase(tx: DbLike, caseId: string): Case {
  const kase = tx.select().from(cases).where(eq(cases.id, caseId)).get();
  if (!kase) throw new WorkflowError('not_found', `No case ${caseId}`);
  return kase;
}

function updateCase(tx: DbLike, kase: Case, patch: Partial<Case>): Case {
  return tx
    .update(cases)
    .set({ ...patch, updatedAt: new Date(), version: kase.version + 1 })
    .where(eq(cases.id, kase.id))
    .returning()
    .get();
}

/** Account status is a separate axis from the case, so it gets its own event. */
function setAccountStatus(
  tx: DbLike,
  kase: Case,
  actorId: string,
  next: AccountStatus | ((current: AccountStatus) => AccountStatus),
): void {
  const account = tx.select().from(accounts).where(eq(accounts.id, kase.accountId)).get();
  if (!account) return;

  const status = typeof next === 'function' ? next(account.status) : next;
  if (account.status === status) return;

  tx.update(accounts).set({ status }).where(eq(accounts.id, account.id)).run();
  insertAuditEvent(tx, {
    caseId: kase.id,
    actorId,
    action: 'account_status_change',
    fromStatus: account.status,
    toStatus: status,
  });
}

function assertVersion(entity: 'Case' | 'Approval', actual: number, expected: number): void {
  if (actual === expected) return;
  throw new WorkflowError(
    'conflict',
    `${entity} was updated by someone else (expected version ${expected}, found ${actual})`,
  );
}

function requireReason(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new WorkflowError('invalid_input', `${label} is required`);
  return trimmed;
}
