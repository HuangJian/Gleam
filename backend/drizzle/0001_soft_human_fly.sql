CREATE TABLE `gleam_ai` (
	`gleam_id` text PRIMARY KEY NOT NULL,
	`provider` text,
	`model` text,
	`summary` text,
	`tags` text,
	`embedding` blob,
	`embedding_model` text,
	`embedding_dimensions` integer,
	`summary_version` text,
	`tag_version` text,
	`relation_version` text,
	`summary_status` text DEFAULT 'pending' NOT NULL,
	`tag_status` text DEFAULT 'pending' NOT NULL,
	`embedding_status` text DEFAULT 'pending' NOT NULL,
	`relation_status` text DEFAULT 'pending' NOT NULL,
	`summary_retry_count` integer DEFAULT 0 NOT NULL,
	`tag_retry_count` integer DEFAULT 0 NOT NULL,
	`embedding_retry_count` integer DEFAULT 0 NOT NULL,
	`relation_retry_count` integer DEFAULT 0 NOT NULL,
	`summary_last_attempt_at` text,
	`tag_last_attempt_at` text,
	`embedding_last_attempt_at` text,
	`relation_last_attempt_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `gleam_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`source_gleam_id` text NOT NULL,
	`target_gleam_id` text NOT NULL,
	`relation_type` text DEFAULT 'semantic_proximity' NOT NULL,
	`strength` real,
	`origin` text DEFAULT 'ai' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `intelligence_config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`encrypted_api_key` text NOT NULL,
	`api_key_iv` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prompt_history` (
	`capability` text NOT NULL,
	`version` text NOT NULL,
	`content` text NOT NULL,
	`checksum` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `repository_ai` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `gleam_derived` ADD `removed_tags` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_gleam_relations_unique` ON `gleam_relations` (`source_gleam_id`,`target_gleam_id`,`relation_type`);