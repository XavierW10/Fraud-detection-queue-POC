CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`external_ref` text NOT NULL,
	`status` text DEFAULT 'clear' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `approvals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`case_id` integer NOT NULL,
	`recommended_resolution` text NOT NULL,
	`requester_reason` text NOT NULL,
	`senior_decision_reason` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_by` integer NOT NULL,
	`decided_by` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`decided_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`case_id` integer NOT NULL,
	`actor_id` integer,
	`action` text NOT NULL,
	`from_status` text,
	`to_status` text,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `cases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`assigned_to` integer,
	`locked_by` integer,
	`locked_at` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`risk_score` real DEFAULT 0 NOT NULL,
	`requires_senior` integer DEFAULT false NOT NULL,
	`triggered_rules` text DEFAULT '[]' NOT NULL,
	`policy_version` text NOT NULL,
	`resolution` text,
	`rationale` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`resolved_at` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`locked_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`amount` real NOT NULL,
	`timestamp` integer NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`device_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
