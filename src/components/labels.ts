import type {
  AccountStatus,
  CaseResolution,
  CaseStatus,
  RecommendedResolution,
  UserRole,
} from '@/db/schema';
import type { RuleId } from '@/rules/types';

/** The persisted role values are internal; these are what an operator reads. */
export const ROLE_LABELS: Record<UserRole, string> = {
  reviewer: 'Fraud Analyst',
  senior: 'Senior Fraud Analyst',
};

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  pending: 'Pending',
  in_review: 'In Review',
  escalated: 'Awaiting Approval',
  approved: 'Approved',
  rejected: 'Rejected',
};

/** The outcome vocabulary the operator sees, over the persisted resolutions. */
export const RESOLUTION_LABELS: Record<CaseResolution, string> = {
  approved: 'Cleared as false positive',
  rejected: 'Rejected',
  confirmed_fraud: 'Confirmed suspicious activity',
};

export const RECOMMENDATION_LABELS: Record<RecommendedResolution, string> = {
  approve: 'Clear as false positive',
  reject: 'Reject',
  confirm_fraud: 'Confirm suspicious activity',
};

/** Keyed by the persisted rule id, which is what a case stores. */
export const RULE_LABELS: Record<RuleId, string> = {
  structuring: 'Structuring',
  geo_impossibility: 'Geographic impossibility',
  shared_device_linkage: 'Shared-device linkage',
};

/** A stored outcome names its rule as a plain string, so unknown ids pass through. */
export function ruleLabel(id: string): string {
  return RULE_LABELS[id as RuleId] ?? id;
}

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  clear: 'Clear',
  flagged: 'Flagged',
  known_bad: 'Known Bad',
  under_review: 'Under Review',
  confirmed_fraud: 'Confirmed Fraud',
  cleared: 'Cleared',
};

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
