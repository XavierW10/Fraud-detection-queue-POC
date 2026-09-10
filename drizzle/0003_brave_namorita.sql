PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	CONSTRAINT "users_role_check" CHECK("__new_users"."role" in ('reviewer', 'senior'))
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "name", "email", "role", "created_at") SELECT "id", "email", "email", "role", "created_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
