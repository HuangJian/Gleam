CREATE TABLE `gleam_derived` (
	`gleam_id` text PRIMARY KEY NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`revisit_count` integer DEFAULT 0 NOT NULL,
	`last_revisited_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `gleams` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`thought` text NOT NULL,
	`source` text NOT NULL,
	`content` text NOT NULL,
	`received_at` text NOT NULL
);
