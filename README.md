# Fraud-detection-queue-POC

Proof-of-concept fraud transaction review queue: a single Next.js (App Router) + TypeScript
application with SQLite via Drizzle ORM (better-sqlite3).

This commit covers the project scaffold and the database foundation only; the fraud policy,
rule engine, ingestion, workflow and UI land in later steps.

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
| `npm run db:seed`     | reset and seed sample data                      |

`DATABASE_URL` overrides the SQLite file path (default `./data/app.db`).

## Data model

Six tables in `src/db/schema.ts`: `users`, `accounts`, `transactions`, `cases`, `approvals`,
`audit_events`. Only primary keys and foreign-key columns — no secondary indexes.

`accounts.status` (how suspicious the account is) and `cases.status` (review workflow state) are
distinct axes. Fraud rule definitions never live in the DB; cases store evaluation outcomes only
(`riskScore`, `triggeredRules`, `policyVersion`).

### Append-only audit trail

`audit_events` rows are immutable: the table has no mutable columns (no `updatedAt`), the access
layer in `src/db/audit.ts` exposes insert and read helpers only, and migration
`0001_audit_events_append_only.sql` installs `BEFORE UPDATE` / `BEFORE DELETE` triggers that
`RAISE(ABORT, ...)`.
