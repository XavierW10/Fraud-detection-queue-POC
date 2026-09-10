'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { caseApi, type ApiResult } from '@/api/client';
import { RECOMMENDATION_LABELS } from '@/components/labels';
import type { RationaleSubmission } from '@/components/RationaleDialog';
import { RationaleDialog } from '@/components/RationaleDialog';
import { availableActions, type CaseActionId } from '@/cases/actions';
import { RECOMMENDED_RESOLUTIONS, type CaseStatus, type UserRole } from '@/db/schema';

export type CaseSnapshot = {
  id: string;
  version: number;
  status: CaseStatus;
  assignedTo: string | null;
  requiresSenior: boolean;
};

export type PendingApproval = { id: string; version: number; requestedBy: string };

type Props = {
  kase: CaseSnapshot;
  actor: { id: string; role: UserRole };
  pendingApproval: PendingApproval | null;
};

type DialogSpec = {
  title: string;
  description: string;
  submitLabel: string;
  choices?: { legend: string; options: { value: string; label: string }[] };
  submit: (submission: RationaleSubmission) => Promise<ApiResult>;
};

const BUTTON_LABELS: Record<CaseActionId, string> = {
  claim: 'Claim',
  clear: 'Clear as False Positive',
  confirm: 'Confirm Suspicious Activity',
  request_approval: 'Request Senior Review',
  approve_request: 'Approve',
  return_request: 'Return for Investigation',
};

/**
 * The role-aware action bar. Which buttons exist is `availableActions`; each
 * one that needs a rationale opens the same dialog, which stays open with the
 * text intact when the server refuses.
 */
export function CaseActions({ kase, actor, pendingApproval }: Props) {
  const router = useRouter();
  // Kept mounted while closing so the dialog can hand focus back to its opener.
  const [dialog, setDialog] = useState<{ action: CaseActionId; open: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const actions = availableActions({ actor, case: kase, pendingApproval });
  if (actions.length === 0) return null;

  const run = (result: Promise<ApiResult>) =>
    startTransition(async () => {
      const outcome = await result;
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }
      close();
      router.refresh();
    });

  const specs: Partial<Record<CaseActionId, DialogSpec>> = {
    clear: {
      title: 'Clear as false positive',
      description: 'Closes the case and clears the account.',
      submitLabel: 'Clear case',
      submit: ({ rationale }) =>
        caseApi.resolve(kase.id, {
          expectedVersion: kase.version,
          resolution: 'approved',
          rationale,
        }),
    },
    confirm: {
      title: 'Confirm suspicious activity',
      description: 'Closes the case and marks the account as confirmed fraud.',
      submitLabel: 'Confirm activity',
      submit: ({ rationale }) =>
        caseApi.resolve(kase.id, {
          expectedVersion: kase.version,
          resolution: 'confirmed_fraud',
          rationale,
        }),
    },
    request_approval: {
      title: 'Request senior review',
      description:
        'The case is above the escalation threshold, so a Senior Fraud Analyst decides the outcome.',
      submitLabel: 'Send for approval',
      choices: {
        legend: 'Recommended resolution',
        options: RECOMMENDED_RESOLUTIONS.map((value) => ({
          value,
          label: RECOMMENDATION_LABELS[value],
        })),
      },
      submit: ({ rationale, choice }) =>
        caseApi.requestApproval(kase.id, {
          expectedVersion: kase.version,
          recommendedResolution:
            RECOMMENDED_RESOLUTIONS.find((value) => value === choice) ?? 'approve',
          requesterReason: rationale,
        }),
    },
    approve_request: {
      title: 'Approve the recommendation',
      description: 'Closes the case on the resolution the analyst recommended.',
      submitLabel: 'Approve',
      submit: ({ rationale }) => decide('approve', rationale),
    },
    return_request: {
      title: 'Return for further investigation',
      description: 'Sends the case back to the analyst as In Review.',
      submitLabel: 'Return case',
      submit: ({ rationale }) => decide('return', rationale),
    },
  };

  function decide(decision: 'approve' | 'return', reason: string): Promise<ApiResult> {
    if (!pendingApproval) {
      return Promise.resolve({
        ok: false,
        code: 'conflict',
        message: 'The approval request is no longer pending. Reload the case.',
      });
    }
    return caseApi.decideApproval(pendingApproval.id, {
      expectedApprovalVersion: pendingApproval.version,
      expectedCaseVersion: kase.version,
      decision,
      reason,
    });
  }

  function close() {
    setDialog((current) => current && { ...current, open: false });
    setError(null);
  }

  const spec = dialog ? specs[dialog.action] : undefined;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((action) => (
        <button
          key={action}
          type="button"
          disabled={pending}
          onClick={() => {
            setError(null);
            if (action === 'claim') {
              run(caseApi.claim(kase.id, kase.version));
              return;
            }
            setDialog({ action, open: true });
          }}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {BUTTON_LABELS[action]}
        </button>
      ))}

      {error && !dialog?.open && (
        <p role="alert" className="text-xs text-rose-600">
          {error}
        </p>
      )}

      {spec && (
        <RationaleDialog
          open={dialog?.open ?? false}
          title={spec.title}
          description={spec.description}
          submitLabel={spec.submitLabel}
          choices={spec.choices}
          pending={pending}
          error={error}
          onCancel={close}
          onSubmit={(submission) => run(spec.submit(submission))}
        />
      )}
    </div>
  );
}
