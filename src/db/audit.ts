import { and, eq, sql } from 'drizzle-orm';
import type { DbLike } from './client';
import { auditEvents, users, ACCOUNT_STATUSES, type AccountStatus } from './schema';

/**
 * Access layer for the append-only audit trail: insert and read only.
 * No update or delete helper exists for `audit_events` anywhere in the codebase,
 * and DB triggers abort such statements.
 */
export type NewAuditEvent = {
  caseId: string;
  actorId?: string | null;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
};

export function insertAuditEvent(db: DbLike, event: NewAuditEvent) {
  return db
    .insert(auditEvents)
    .values({
      caseId: event.caseId,
      actorId: event.actorId ?? null,
      action: event.action,
      fromStatus: event.fromStatus ?? null,
      toStatus: event.toStatus ?? null,
    })
    .returning()
    .get();
}

/**
 * The status an account held before this case last moved it to `toStatus`.
 * The trail is the record of where a status came from, so a change can be
 * undone without a second column tracking it.
 */
export function statusBeforeChangeTo(
  db: DbLike,
  caseId: string,
  toStatus: AccountStatus,
): AccountStatus | null {
  const previous = db
    .select({ fromStatus: auditEvents.fromStatus })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.caseId, caseId),
        eq(auditEvents.action, 'account_status_change'),
        eq(auditEvents.toStatus, toStatus),
      ),
    )
    .orderBy(sql`${auditEvents}.rowid desc`)
    .get();

  return ACCOUNT_STATUSES.find((status) => status === previous?.fromStatus) ?? null;
}

export function listAuditEventsForCase(db: DbLike, caseId: string) {
  return (
    db
      .select({ event: auditEvents, actor: { id: users.id, name: users.name } })
      .from(auditEvents)
      .leftJoin(users, eq(auditEvents.actorId, users.id))
      .where(eq(auditEvents.caseId, caseId))
      // Insertion order: UUID primary keys do not sort chronologically.
      .orderBy(sql`${auditEvents}.rowid`)
      .all()
      // A null actor is a system event, and stays null rather than becoming a user.
      .map(({ event, actor }) => ({ ...event, actor }))
  );
}
