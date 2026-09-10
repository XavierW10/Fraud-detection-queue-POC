import type { AccountStatus, ApprovalStatus, CaseResolution, CaseStatus } from './schema';

/**
 * Fixed demo data for the AML policy. Every id and timestamp is a literal so
 * the seed is deterministic: re-running it produces the same rows, and the
 * evaluation stamped on each case never changes between runs.
 *
 * All values are synthetic. Accounts carry an opaque external reference only —
 * no names, card numbers or other customer PII.
 */

const id = (kind: string, n: number) =>
  `00000000-0000-4000-8000-${kind}${String(n).padStart(4, '0')}`;

/** Reference instant for the whole dataset: 2025-01-06T09:00:00Z. */
export const SEED_EPOCH = Date.UTC(2025, 0, 6, 9, 0, 0);

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** Minutes after `SEED_EPOCH`, so every timestamp is relative and fixed. */
const at = (hours: number, minutes = 0) => new Date(SEED_EPOCH + hours * HOUR + minutes * MINUTE);

export const USER_IDS = {
  analyst: id('11', 1),
  senior: id('11', 2),
} as const;

export const seedUsers = [
  {
    id: USER_IDS.analyst,
    name: 'Xavier Warmerdam',
    email: 'xavier.warmerdam@example.com',
    role: 'reviewer',
  },
  {
    id: USER_IDS.senior,
    name: 'Jane Doe',
    email: 'jane.doe@example.com',
    role: 'senior',
  },
] as const;

export const ACCOUNT_IDS = {
  /** Nothing triggers: small amounts, one device, one city. */
  clear: id('22', 1),
  /** Structuring only. */
  structuring: id('22', 2),
  /** Geo-impossibility only. */
  geo: id('22', 3),
  /** Structuring + geo-impossibility: over the escalation threshold. */
  multiRule: id('22', 4),
  /** Shares a device with the known-bad account. */
  sharedDevice: id('22', 5),
  /** Structuring + the known-bad counterpart in the shared-device example. */
  knownBad: id('22', 6),
} as const;

/** One device deliberately spans two accounts; the rest are account-local. */
const DEVICE = {
  clear: 'dev-3f7a91',
  structuring: 'dev-8c21de',
  geo: 'dev-b40f5c',
  multiRule: 'dev-6d9e02',
  /** Used by both `sharedDevice` and `knownBad`. */
  shared: 'dev-shared-9f2',
} as const;

export const seedAccounts: { id: string; externalRef: string; status: AccountStatus }[] = [
  { id: ACCOUNT_IDS.clear, externalRef: 'ACC-1001', status: 'clear' },
  { id: ACCOUNT_IDS.structuring, externalRef: 'ACC-1002', status: 'flagged' },
  { id: ACCOUNT_IDS.geo, externalRef: 'ACC-1003', status: 'cleared' },
  { id: ACCOUNT_IDS.multiRule, externalRef: 'ACC-1004', status: 'under_review' },
  { id: ACCOUNT_IDS.sharedDevice, externalRef: 'ACC-1005', status: 'flagged' },
  { id: ACCOUNT_IDS.knownBad, externalRef: 'ACC-1006', status: 'known_bad' },
];

type SeedTransaction = {
  id: string;
  accountId: string;
  amount: number;
  timestamp: Date;
  latitude: number;
  longitude: number;
  deviceId: string;
};

let sequence = 0;
const tx = (
  accountId: string,
  amount: number,
  timestamp: Date,
  [latitude, longitude]: readonly [number, number],
  deviceId: string,
): SeedTransaction => ({
  id: id('33', ++sequence),
  accountId,
  amount,
  timestamp,
  latitude,
  longitude,
  deviceId,
});

const NEW_YORK = [40.7128, -74.006] as const;
const CHICAGO = [41.8781, -87.6298] as const;
const LISBON = [38.7223, -9.1393] as const;
const WARSAW = [52.2297, 21.0122] as const;
const MIAMI = [25.7617, -80.1918] as const;
const LOS_ANGELES = [34.0522, -118.2437] as const;
const TORONTO = [43.6532, -79.3832] as const;

export const seedTransactions: SeedTransaction[] = [
  // ACC-1001 — everyday spending: amounts below the structuring band, one
  // device, one city. No rule fires.
  tx(ACCOUNT_IDS.clear, 42.1, at(0), NEW_YORK, DEVICE.clear),
  tx(ACCOUNT_IDS.clear, 128.75, at(26), NEW_YORK, DEVICE.clear),

  // ACC-1002 — structuring: three deposits just under $10,000 inside 72 hours,
  // all from the same place so geo stays quiet.
  tx(ACCOUNT_IDS.structuring, 8200, at(0), CHICAGO, DEVICE.structuring),
  tx(ACCOUNT_IDS.structuring, 9150, at(20), CHICAGO, DEVICE.structuring),
  tx(ACCOUNT_IDS.structuring, 9999, at(60), CHICAGO, DEVICE.structuring),

  // ACC-1003 — geo-impossibility: Lisbon to Warsaw (~2,750 km) in 90 minutes.
  // Amounts sit outside the structuring band.
  tx(ACCOUNT_IDS.geo, 1200, at(0), LISBON, DEVICE.geo),
  tx(ACCOUNT_IDS.geo, 350, at(1, 30), WARSAW, DEVICE.geo),

  // ACC-1004 — structuring AND geo-impossibility: three in-band amounts within
  // 72 hours, two of them Miami to Los Angeles (~3,760 km) in two hours.
  tx(ACCOUNT_IDS.multiRule, 8400, at(0), MIAMI, DEVICE.multiRule),
  tx(ACCOUNT_IDS.multiRule, 9600, at(2), LOS_ANGELES, DEVICE.multiRule),
  tx(ACCOUNT_IDS.multiRule, 9900, at(32), LOS_ANGELES, DEVICE.multiRule),

  // ACC-1005 — shared-device linkage: unremarkable transactions, but on a
  // device the known-bad account also uses.
  tx(ACCOUNT_IDS.sharedDevice, 500, at(0), TORONTO, DEVICE.shared),
  tx(ACCOUNT_IDS.sharedDevice, 1750, at(18), TORONTO, DEVICE.shared),

  // ACC-1006 — the known-bad account behind that link. Its own structuring
  // deposits put it over the threshold, which is why it reached a senior.
  tx(ACCOUNT_IDS.knownBad, 8050, at(-70), TORONTO, DEVICE.shared),
  tx(ACCOUNT_IDS.knownBad, 8900, at(-48), TORONTO, DEVICE.shared),
  tx(ACCOUNT_IDS.knownBad, 9400, at(-24), TORONTO, DEVICE.shared),
  tx(ACCOUNT_IDS.knownBad, 2400, at(-6), TORONTO, DEVICE.shared),
];

export const CASE_IDS = {
  clear: id('44', 1),
  structuring: id('44', 2),
  geo: id('44', 3),
  multiRule: id('44', 4),
  sharedDevice: id('44', 5),
  knownBad: id('44', 6),
} as const;

/**
 * Workflow state per case. `riskScore`, `triggeredRules` and `requiresSenior`
 * are not listed here: the seed runs the rule engine over the transactions
 * above and stamps the real evaluation, so the demo data cannot drift from the
 * policy.
 */
export type SeedCase = {
  id: string;
  accountId: string;
  status: CaseStatus;
  assignedTo?: string;
  lockedBy?: string;
  lockedAt?: Date;
  resolution?: CaseResolution;
  rationale?: string;
  resolvedAt?: Date;
  version: number;
};

export const seedCases: SeedCase[] = [
  // Untouched in the queue.
  { id: CASE_IDS.clear, accountId: ACCOUNT_IDS.clear, status: 'pending', version: 1 },
  { id: CASE_IDS.sharedDevice, accountId: ACCOUNT_IDS.sharedDevice, status: 'pending', version: 1 },

  // Claimed and being triaged.
  {
    id: CASE_IDS.structuring,
    accountId: ACCOUNT_IDS.structuring,
    status: 'in_review',
    assignedTo: USER_IDS.analyst,
    lockedBy: USER_IDS.analyst,
    lockedAt: at(70),
    version: 2,
  },

  // Below the threshold, so the analyst closed it themselves.
  {
    id: CASE_IDS.geo,
    accountId: ACCOUNT_IDS.geo,
    status: 'approved',
    assignedTo: USER_IDS.analyst,
    resolution: 'approved',
    rationale: 'Customer confirmed travel; coordinates came from a VPN exit node.',
    resolvedAt: at(4),
    version: 3,
  },

  // Above the threshold: escalated on open, senior decision outstanding.
  {
    id: CASE_IDS.multiRule,
    accountId: ACCOUNT_IDS.multiRule,
    status: 'escalated',
    assignedTo: USER_IDS.analyst,
    lockedBy: USER_IDS.analyst,
    lockedAt: at(36),
    version: 3,
  },

  // Above the threshold and already decided by the senior.
  {
    id: CASE_IDS.knownBad,
    accountId: ACCOUNT_IDS.knownBad,
    status: 'rejected',
    assignedTo: USER_IDS.analyst,
    resolution: 'confirmed_fraud',
    rationale: 'Mule account: device reused across unrelated customers, funds withdrawn same day.',
    resolvedAt: at(-2),
    version: 4,
  },
];

export const seedApprovals: {
  id: string;
  caseId: string;
  recommendedResolution: 'approve' | 'reject' | 'confirm_fraud';
  requesterReason: string;
  seniorDecisionReason?: string;
  status: ApprovalStatus;
  requestedBy: string;
  decidedBy?: string;
  decidedAt?: Date;
  version: number;
}[] = [
  {
    id: id('55', 1),
    caseId: CASE_IDS.multiRule,
    recommendedResolution: 'confirm_fraud',
    requesterReason: 'Structuring pattern plus impossible travel; recommend confirming fraud.',
    status: 'pending',
    requestedBy: USER_IDS.analyst,
    version: 1,
  },
  {
    id: id('55', 2),
    caseId: CASE_IDS.knownBad,
    recommendedResolution: 'confirm_fraud',
    requesterReason: 'Device reused across accounts with no plausible relationship.',
    seniorDecisionReason: 'Agreed — account marked known bad and referred to the AML team.',
    status: 'approved',
    requestedBy: USER_IDS.analyst,
    decidedBy: USER_IDS.senior,
    decidedAt: at(-2),
    version: 2,
  },
];

/**
 * The trail each case would have accumulated. Rows are append-only, so the
 * seed inserts them by fixed id and leaves existing ones untouched.
 */
export const seedAuditEvents: {
  id: string;
  caseId: string;
  actorId: string | null;
  action: string;
  fromStatus?: string;
  toStatus?: string;
}[] = [
  // System events from ingestion carry no actor.
  ...seedCases.map((seedCase, index) => ({
    id: id('66', index + 1),
    caseId: seedCase.id,
    actorId: null,
    action: 'case_created',
    toStatus: 'pending',
  })),

  {
    id: id('66', 11),
    caseId: CASE_IDS.structuring,
    actorId: USER_IDS.analyst,
    action: 'open',
    fromStatus: 'pending',
    toStatus: 'in_review',
  },
  {
    id: id('66', 12),
    caseId: CASE_IDS.geo,
    actorId: USER_IDS.analyst,
    action: 'open',
    fromStatus: 'pending',
    toStatus: 'in_review',
  },
  {
    id: id('66', 13),
    caseId: CASE_IDS.geo,
    actorId: USER_IDS.analyst,
    action: 'approve',
    fromStatus: 'in_review',
    toStatus: 'approved',
  },
  {
    id: id('66', 14),
    caseId: CASE_IDS.geo,
    actorId: USER_IDS.analyst,
    action: 'account_status_change',
    fromStatus: 'clear',
    toStatus: 'cleared',
  },
  {
    id: id('66', 21),
    caseId: CASE_IDS.multiRule,
    actorId: USER_IDS.analyst,
    action: 'open',
    fromStatus: 'pending',
    toStatus: 'in_review',
  },
  {
    id: id('66', 22),
    caseId: CASE_IDS.multiRule,
    actorId: USER_IDS.analyst,
    action: 'escalate',
    fromStatus: 'in_review',
    toStatus: 'escalated',
  },
  {
    id: id('66', 23),
    caseId: CASE_IDS.multiRule,
    actorId: USER_IDS.analyst,
    action: 'request_approval',
  },
  {
    id: id('66', 31),
    caseId: CASE_IDS.knownBad,
    actorId: USER_IDS.analyst,
    action: 'open',
    fromStatus: 'pending',
    toStatus: 'in_review',
  },
  {
    id: id('66', 32),
    caseId: CASE_IDS.knownBad,
    actorId: USER_IDS.analyst,
    action: 'escalate',
    fromStatus: 'in_review',
    toStatus: 'escalated',
  },
  {
    id: id('66', 33),
    caseId: CASE_IDS.knownBad,
    actorId: USER_IDS.analyst,
    action: 'request_approval',
  },
  {
    id: id('66', 34),
    caseId: CASE_IDS.knownBad,
    actorId: USER_IDS.senior,
    action: 'reject',
    fromStatus: 'escalated',
    toStatus: 'rejected',
  },
  {
    id: id('66', 35),
    caseId: CASE_IDS.knownBad,
    actorId: USER_IDS.senior,
    action: 'account_status_change',
    fromStatus: 'under_review',
    toStatus: 'known_bad',
  },
];
