# Fraud-detection-queue-POC

Proof-of-concept fraud transaction review queue: a single Next.js (App Router) + TypeScript
application with SQLite via Drizzle ORM (better-sqlite3).

Transactions are scored against a YAML fraud policy, flagged accounts become cases in a review
queue, and a Fraud Analyst works them to a decision — escalating anything above the escalation
threshold to a Senior Fraud Analyst, who approves or returns it. Every state change is versioned,
transactional and written to an append-only audit trail.

There is no login: the demo runs as one of two seeded personas, switched from the header.

## Run it locally

### 1. Prerequisites

- **Node.js 20.9 or newer** (developed on 24). `node -v` to check; [nvm](https://github.com/nvm-sh/nvm)
  is the easiest way to get it.
- **npm 10+**, which ships with those Node versions.
- A **C/C++ toolchain**, only if npm cannot find a prebuilt `better-sqlite3` binary for your
  platform and falls back to compiling it: Xcode Command Line Tools on macOS
  (`xcode-select --install`), `build-essential` and `python3` on Debian/Ubuntu, or the
  "Desktop development with C++" workload on Windows. Nothing else is needed — SQLite is embedded,
  so there is no database server to install and no service to start.

No API keys, environment variables or `.env` file are required. The application listens on port
3000 and talks to nothing but its own SQLite file.

### 2. Install, build the database, start

```bash
git clone https://github.com/XavierW10/Fraud-detection-queue-POC.git
cd Fraud-detection-queue-POC

npm install          # installs dependencies and compiles better-sqlite3 if needed
npm run db:reset     # creates ./data/app.db, applies migrations, loads the demo dataset
npm run dev          # http://localhost:3000
```

`db:reset` is `db:migrate` plus `db:seed` against a freshly deleted file, and is the command to
reach for whenever you want the demo back at its starting state. On a machine that has never run
the app, `npm run db:migrate && npm run db:seed` does the same thing.

Open <http://localhost:3000>; it redirects to `/queue`. You should see six cases and, in the top
right, **Xavier Warmerdam · Fraud Analyst**. If the queue is empty, the database was not seeded —
run `npm run db:reset` (stop the dev server first, see [Troubleshooting](#troubleshooting)).

The database file lives at `./data/app.db` and is git-ignored. Set `DATABASE_URL` to put it
somewhere else:

```bash
DATABASE_URL=/tmp/fraud.db npm run db:reset
DATABASE_URL=/tmp/fraud.db npm run dev
```

### 3. Check your setup

```bash
npm test         # ~105 tests, no database file or dev server needed (in-memory SQLite)
npm run lint
npm run build    # also generates the route types `npm run typecheck` needs
npm run typecheck
```

## Walking through the demo

The seeded dataset (six accounts, six cases) is arranged so every path is reachable from a fresh
`db:reset`. Personas are switched with the button in the top-right of the header, which sets the
`demo_user_id` cookie and re-renders the page as that user — no reload, no login.

### Main flow: analyst escalates, senior decides

1. **As Xavier (Fraud Analyst), review the queue** at `/queue`. The four cards count open,
   flagged, awaiting-approval and unassigned cases, and clicking one filters the table. Default
   order is open before closed, flagged before unflagged, higher risk first, oldest first.
2. **Open the flagged case `ACC-1004`** (structuring + geo-impossibility, score 80, _Awaiting
   Approval_). The case page shows the triggered rules with their evidence, the account's
   transactions (rows a rule fired on are highlighted), the policy version the score was produced
   under, and the audit history. Xavier raised this request, so the page offers him no actions —
   that is the separation of duties, not a missing button.
3. **Switch persona to Jane Doe (Senior Fraud Analyst)** with the button in the top right. An
   **Approvals** tab appears in the nav; an analyst is not offered it, and the page refuses the
   request as well if you navigate to `/approvals` directly.
4. **Open `/approvals` and return the request.** Requests are listed oldest first with the case
   and account, risk score, triggered rules, who raised it, what they recommended, their
   rationale and how long it has waited. **Return for Investigation** sends the case back to
   _In Review_ and restores the account status the escalation changed, using the audit trail to
   find what it was. A rationale is required.
5. **Switch back to Xavier and escalate it yourself.** The case is now In Review and assigned to
   him, and because it is at or above the threshold of 60 the only closing action offered is
   **Request Senior Review**: choose a recommended resolution, write a rationale, submit. The case
   returns to _Awaiting Approval_.
6. **Switch to Jane and approve it.** The case closes on the resolution Xavier recommended and
   the account status follows. A senior cannot decide a request they raised themselves.
7. **Reopen the case** and read the audit history: every claim, escalation, request, account
   status change and decision, each with an actor and a timestamp, and none of it editable.

To exercise **claiming**, use one of the two pending unassigned cases — `ACC-1005` (shared-device
linkage, 40) or `ACC-1001` (nothing triggered, 0) — from the case page or the queue row. Both
score below the threshold, so after claiming they take the direct resolution path below rather
than the senior one.

### Secondary flow: analyst resolves a below-threshold case

As Xavier, open a case scoring under 60 — `ACC-1002` (structuring, 45) is seeded already assigned
to him and _In Review_. Below the threshold the analyst decides alone: **Clear as False Positive**
(closes the case, clears the account) or **Confirm Suspicious Activity** (closes it as confirmed
fraud). Both take a rationale.

### Things worth trying

- **Separation of duties.** As Xavier, there is no direct close on a flagged case; as Jane, a
  request she raised herself offers her no decision buttons.
- **Read-only states.** A case assigned to someone else, a case awaiting approval seen by its
  requester, and any closed case show no actions.
- **Stale updates.** Open the same case in two tabs, act in one, then act in the other: the second
  write is refused with a `409` explaining the version it expected, the dialog keeps your text,
  and the page refreshes so you can resubmit against current state.
- **Explainability.** `/policy` shows the rules, weights and threshold in force, and how the
  weights combine to reach it. It is read-only — the policy lives in `fraud-policy.yaml`, and
  nothing in the application writes it.

### The seeded dataset

| account    | rules triggered       | score | case state                            |
| ---------- | --------------------- | ----- | ------------------------------------- |
| `ACC-1001` | none                  | 0     | Pending, unassigned                   |
| `ACC-1002` | structuring           | 45    | In Review, assigned to Xavier         |
| `ACC-1003` | geo-impossibility     | 35    | Approved (closed by Xavier)           |
| `ACC-1004` | structuring + geo     | 80    | Awaiting Approval, request for Jane   |
| `ACC-1005` | shared-device linkage | 40    | Pending, unassigned                   |
| `ACC-1006` | structuring + linkage | 85    | Rejected as confirmed fraud (by Jane) |

All of it is synthetic and contains no customer PII.

## Troubleshooting

- **"SQLITE_BUSY" or the reset appears to do nothing.** The dev server holds the database file
  open. Stop it, run `npm run db:reset`, start it again.
- **The queue is empty, or a demo step is unreachable** (for example every case is already
  claimed). Re-seed: `npm run db:seed` restores the seeded rows including the columns the workflow
  writes, and `npm run db:reset` additionally discards anything the demo added — audit events are
  append-only and new cases have ids the seed does not know about.
- **`npm install` fails building `better-sqlite3`.** No prebuilt binary matched your platform;
  install the toolchain listed under [Prerequisites](#1-prerequisites) and try again.
- **`npm run typecheck` reports missing route types.** Next generates them during a build; run
  `npm run build` (or `npm run dev`) once first.
- **Port 3000 is taken.** `npm run dev -- -p 3001`.
- **The persona switcher shows the wrong user.** The persona is a cookie; clear `demo_user_id`
  for `localhost` or pick the persona again.

## Scripts

| script                | purpose                                         |
| --------------------- | ----------------------------------------------- |
| `npm run dev`         | Next.js dev server                              |
| `npm run build`       | production build                                |
| `npm test`            | Vitest suite                                    |
| `npm run lint`        | ESLint                                          |
| `npm run typecheck`   | `tsc --noEmit` (run `npm run build` once first) |
| `npm run format`      | Prettier                                        |
| `npm run db:generate` | generate a Drizzle migration from the schema    |
| `npm run db:migrate`  | apply migrations                                |
| `npm run db:seed`     | seed the fixed demo dataset (idempotent)        |
| `npm run db:reset`    | delete the database, migrate and seed it again  |

`DATABASE_URL` overrides the SQLite file path (default `./data/app.db`).

## Data model

Six tables in `src/db/schema.ts`: `users`, `accounts`, `transactions`, `cases`, `approvals`,
`audit_events`. Only primary keys and foreign-key columns — no secondary indexes.

`accounts.status` (how suspicious the account is) and `cases.status` (review workflow state) are
distinct axes. Fraud rule definitions never live in the DB; cases store evaluation outcomes only
(`riskScore`, `triggeredRules`, `policyVersion`).

The seed in `src/db/seed.ts` is deterministic and idempotent: every row has a literal id and is
upserted, and each case is stamped with a live `evaluateAccount()` run so seeded scores cannot
drift from the policy.

### Append-only audit trail

`audit_events` rows are immutable: the table has no mutable columns (no `updatedAt`), the access
layer in `src/db/audit.ts` exposes insert and read helpers only, and migration
`0001_audit_events_append_only.sql` installs `BEFORE UPDATE` / `BEFORE DELETE` triggers that
`RAISE(ABORT, ...)`.

## Fraud policy

`fraud-policy.yaml` holds the policy: id, version, an escalation threshold of 60, and three
weighted rules (structuring 45, geo-impossibility 35, shared-device linkage 40). It is read-only
at runtime — `src/policy/load.ts` parses and Zod-validates it on every read, and nothing in the
application writes it. `src/rules/` evaluates an account purely, scoring each rule at most once;
a case needs senior sign-off when the total reaches the threshold.

## Review workflow and API

The current demo user comes from a `demo_user_id` cookie, with the role read from the DB. Role
rules live in `src/workflow/permissions.ts`, the case state machine in
`src/workflow/transitions.ts`, and the services in `src/workflow/service.ts` — every mutation
takes an expected version, and the record change plus its audit event share one transaction.

Route handlers under `src/app/api/` stay thin (parse, resolve user, check role, call a service,
respond) and share one error mapper:

| endpoint                                   | purpose                          |
| ------------------------------------------ | -------------------------------- |
| `GET /api/cases`                           | queue, filterable and paged      |
| `GET /api/cases/:caseId`                   | case detail with the audit trail |
| `POST /api/cases/:caseId/claim`            | claim a pending case             |
| `POST /api/cases/:caseId/decision`         | resolve directly                 |
| `POST /api/cases/:caseId/request-approval` | escalate to a senior             |
| `GET /api/approvals`                       | approval requests                |
| `POST /api/approvals/:approvalId/decision` | senior approves or returns       |
| `GET /api/policy`                          | the policy in force              |

The queue takes `?limit=` (1-100, default 25) and `?offset=`, and answers with the page window
and the unpaged `total`. The two queue reads and the case detail carry an `ETag` over the bytes
they return: send it back as `If-None-Match` and an unchanged page answers `304`, so a client can
poll for someone else's change instead of discovering it when its own write is refused with `409`.

Each triggered rule carries `evidence` alongside its sentence: the transactions in the qualifying
structuring window, the fastest geo pair with distance and implied speed, or the linked
device/account pairs and this account's transactions on those devices — enough for the UI to
highlight the rows a rule fired on.

## Application shell

`src/app/layout.tsx` renders a compact internal-tool shell: the application name, primary
navigation, the current user, and the demo-persona switcher in the top right. Navigation is
role-aware — Approvals is a senior's inbox, so an analyst is not offered the tab, and the page
refuses it as well. Choosing a persona calls the `switchPersona` server action in
`src/app/actions.ts`, which validates the id against the seeded users, writes `demo_user_id` and
revalidates the layout, so the header, nav and page data all re-render as the chosen user without
a full reload.

Pages: `/queue` (summary cards, client-side filters and the priority sort, with claim on an
unassigned pending row), `/cases/[caseId]` (rules and evidence, transactions, approvals, audit
history, and the role-aware action bar), `/approvals` (pending requests, senior only) and
`/policy` (the rules and threshold in force).

Which buttons a case shows is derived in `src/cases/actions.ts` from the role, case status,
assignment, flag status and any pending approval; the server enforces the same rules
independently, so a hidden button is convenience, not access control. Each action that needs a
rationale opens one shared dialog, which requires non-whitespace text, blocks double submission,
and on a `409` keeps what you typed while refreshing the case so the retry sees current state.

## Tests

`tests/rules` covers the pure policy logic; `tests/application` drives the real route handlers
against a seeded in-memory database; the rest cover the schema, seed and services.
