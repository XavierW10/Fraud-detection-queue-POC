CREATE TRIGGER `audit_events_no_update`
BEFORE UPDATE ON `audit_events`
BEGIN
	SELECT RAISE(ABORT, 'audit_events is append-only: UPDATE is not allowed');
END;
--> statement-breakpoint
CREATE TRIGGER `audit_events_no_delete`
BEFORE DELETE ON `audit_events`
BEGIN
	SELECT RAISE(ABORT, 'audit_events is append-only: DELETE is not allowed');
END;
