# Fraud-detection-queue-POC

Proof-of-concept fraud transaction review queue: a single Next.js (App Router) + TypeScript
application with SQLite via Drizzle ORM (better-sqlite3).

The database, the YAML fraud policy and its rule engine, the review workflow services and the
HTTP API are in place. The reviewer UI lands in a later step.

## Getting started

```bash
npm install
npm run db:migrate   # apply drizzle migrations to ./data/app.db
npm run db:seed      # seed users, accounts and transactions
npm run dev
```

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

Pages: `/queue` (the operational queue, filterable to the current user's cases), `/approvals`
(pending requests, senior only) and `/policy` (the rules and threshold in force).

## Tests

`tests/rules` covers the pure policy logic; `tests/application` drives the real route handlers
against a seeded in-memory database; the rest cover the schema, seed and services.
