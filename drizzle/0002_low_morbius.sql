PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`external_ref` text NOT NULL,
	`status` text DEFAULT 'clear' NOT NULL,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT "accounts_status_check" CHECK("__new_accounts"."status" in ('clear', 'flagged', 'known_bad', 'under_review', 'confirmed_fraud', 'cleared'))
);
--> statement-breakpoint
INSERT INTO `__new_accounts`("id", "external_ref", "status", "created_at") SELECT "id", "external_ref", "status", "created_at" FROM `accounts`;--> statement-breakpoint
DROP TABLE `accounts`;--> statement-breakpoint
ALTER TABLE `__new_accounts` RENAME TO `accounts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_approvals` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`recommended_resolution` text NOT NULL,
	`requester_reason` text NOT NULL,
	`senior_decision_reason` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_by` text NOT NULL,
	`decided_by` text,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`decided_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "approvals_recommended_resolution_check" CHECK("__new_approvals"."recommended_resolution" in ('approve', 'reject', 'confirm_fraud')),
	CONSTRAINT "approvals_status_check" CHECK("__new_approvals"."status" in ('pending', 'approved', 'rejected'))
);
--> statement-breakpoint
INSERT INTO `__new_approvals`("id", "case_id", "recommended_resolution", "requester_reason", "senior_decision_reason", "status", "requested_by", "decided_by", "created_at", "updated_at", "decided_at", "version") SELECT "id", "case_id", "recommended_resolution", "requester_reason", "senior_decision_reason", "status", "requested_by", "decided_by", "created_at", "updated_at", "decided_at", "version" FROM `approvals`;--> statement-breakpoint
DROP TABLE `approvals`;--> statement-breakpoint
ALTER TABLE `__new_approvals` RENAME TO `approvals`;--> statement-breakpoint
CREATE TABLE `__new_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`assigned_to` text,
	`locked_by` text,
	`locked_at` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`risk_score` real DEFAULT 0 NOT NULL,
	`requires_senior` integer DEFAULT false NOT NULL,
	`triggered_rules` text DEFAULT '[]' NOT NULL,
	`policy_version` text NOT NULL,
	`resolution` text,
	`rationale` text,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`resolved_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`locked_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cases_status_check" CHECK("__new_cases"."status" in ('pending', 'in_review', 'escalated', 'approved', 'rejected')),
	CONSTRAINT "cases_resolution_check" CHECK("__new_cases"."resolution" is null or "__new_cases"."resolution" in ('approved', 'rejected', 'confirmed_fraud'))
);
--> statement-breakpoint
INSERT INTO `__new_cases`("id", "account_id", "assigned_to", "locked_by", "locked_at", "status", "risk_score", "requires_senior", "triggered_rules", "policy_version", "resolution", "rationale", "created_at", "updated_at", "resolved_at", "version") SELECT "id", "account_id", "assigned_to", "locked_by", "locked_at", "status", "risk_score", "requires_senior", "triggered_rules", "policy_version", "resolution", "rationale", "created_at", "updated_at", "resolved_at", "version" FROM `cases`;--> statement-breakpoint
DROP TABLE `cases`;--> statement-breakpoint
ALTER TABLE `__new_cases` RENAME TO `cases`;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT "users_role_check" CHECK("__new_users"."role" in ('reviewer', 'senior'))
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "email", "role", "created_at") SELECT "id", "email", "role", "created_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;