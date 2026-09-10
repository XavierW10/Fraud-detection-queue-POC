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
| `GET /api/cases`                           | queue, filterable                |
| `GET /api/cases/:caseId`                   | case detail with the audit trail |
| `POST /api/cases/:caseId/claim`            | claim a pending case             |
| `POST /api/cases/:caseId/decision`         | resolve directly                 |
| `POST /api/cases/:caseId/request-approval` | escalate to a senior             |
| `GET /api/approvals`                       | approval requests                |
| `POST /api/approvals/:approvalId/decision` | senior approves or returns       |
| `GET /api/policy`                          | the policy in force              |

## Tests

`tests/rules` covers the pure policy logic; `tests/application` drives the real route handlers
against a seeded in-memory database; the rest cover the schema, seed and services.
