PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_intelligence_config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`embedding_model` text NOT NULL,
	`encrypted_api_key` text NOT NULL,
	`api_key_iv` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_intelligence_config`("id", "provider", "model", "embedding_model", "encrypted_api_key", "api_key_iv", "updated_at") SELECT "id", "provider", "model", "embedding_model", "encrypted_api_key", "api_key_iv", "updated_at" FROM `intelligence_config`;--> statement-breakpoint
DROP TABLE `intelligence_config`;--> statement-breakpoint
ALTER TABLE `__new_intelligence_config` RENAME TO `intelligence_config`;--> statement-breakpoint
PRAGMA foreign_keys=ON;