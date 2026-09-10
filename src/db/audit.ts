import { eq, sql } from 'drizzle-orm';
import type { Db } from './client';
import { auditEvents } from './schema';

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

export function insertAuditEvent(db: Db, event: NewAuditEvent) {
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

export function listAuditEventsForCase(db: Db, caseId: string) {
  return (
    db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.caseId, caseId))
      // Insertion order: UUID primary keys do not sort chronologically.
      .orderBy(sql`rowid`)
      .all()
  );
}
