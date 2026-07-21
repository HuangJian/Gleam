-- Deduplicate prompt_history and enforce the (capability, version) primary key.
--
-- Root cause: the table was created without a PRIMARY KEY/UNIQUE constraint,
-- so savePromptSnapshot()'s `.onConflictDoNothing()` was a no-op. Every
-- process restart (main.ts calls stageSnapshots() once at boot) re-inserted
-- the same v1 prompts, producing 33x duplicates per capability.
--
-- This migration collapses each (capability, version) group to a single row
-- (keeping the earliest created_at — the first-used version, per the table's
-- explainability purpose) and adds the composite primary key.

PRAGMA foreign_keys=OFF;--> statement-breakpoint

DROP TABLE IF EXISTS `__new_prompt_history`;--> statement-breakpoint

CREATE TABLE `__new_prompt_history` (
	`capability` text NOT NULL,
	`version` text NOT NULL,
	`content` text NOT NULL,
	`checksum` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY (`capability`, `version`)
);--> statement-breakpoint

INSERT INTO `__new_prompt_history` ("capability", "version", "content", "checksum", "created_at")
SELECT "capability", "version", "content", "checksum", "created_at"
FROM (
  SELECT
    "capability", "version", "content", "checksum", "created_at",
    ROW_NUMBER() OVER (
      PARTITION BY "capability", "version"
      ORDER BY "created_at" ASC
    ) AS "rn"
  FROM "prompt_history"
) WHERE "rn" = 1;--> statement-breakpoint

DROP TABLE `prompt_history`;--> statement-breakpoint

ALTER TABLE `__new_prompt_history` RENAME TO `prompt_history`;--> statement-breakpoint

PRAGMA foreign_keys=ON;
