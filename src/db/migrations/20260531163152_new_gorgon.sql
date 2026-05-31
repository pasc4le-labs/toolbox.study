PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ai_providers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`provider_type` text DEFAULT 'openai-compatible' NOT NULL,
	`base_url` text NOT NULL,
	`api_key` text,
	`model_id` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT 1780245111997 NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_ai_providers`("id", "name", "provider_type", "base_url", "api_key", "model_id", "is_default", "created_at") SELECT "id", "name", "provider_type", "base_url", "api_key", "model_id", "is_default", "created_at" FROM `ai_providers`;--> statement-breakpoint
DROP TABLE `ai_providers`;--> statement-breakpoint
ALTER TABLE `__new_ai_providers` RENAME TO `ai_providers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_bundles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`exam_question_count` integer,
	`exam_time_limit_seconds` integer,
	`exam_difficulty_filter` real,
	`exam_points_per_correct` real,
	`exam_points_per_wrong` real,
	`created_at` integer DEFAULT 1780245111996 NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_bundles`("id", "title", "description", "exam_question_count", "exam_time_limit_seconds", "exam_difficulty_filter", "exam_points_per_correct", "exam_points_per_wrong", "created_at") SELECT "id", "title", "description", "exam_question_count", "exam_time_limit_seconds", "exam_difficulty_filter", "exam_points_per_correct", "exam_points_per_wrong", "created_at" FROM `bundles`;--> statement-breakpoint
DROP TABLE `bundles`;--> statement-breakpoint
ALTER TABLE `__new_bundles` RENAME TO `bundles`;--> statement-breakpoint
CREATE TABLE `__new_card_fsrs` (
	`card_id` integer PRIMARY KEY NOT NULL,
	`difficulty` real DEFAULT 0 NOT NULL,
	`stability` real DEFAULT 0 NOT NULL,
	`state` integer DEFAULT 0 NOT NULL,
	`due` integer DEFAULT 1780245111996 NOT NULL,
	`elapsed_days` integer DEFAULT 0 NOT NULL,
	`scheduled_days` integer DEFAULT 0 NOT NULL,
	`reps` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`last_review` integer,
	`learning_steps` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_card_fsrs`("card_id", "difficulty", "stability", "state", "due", "elapsed_days", "scheduled_days", "reps", "lapses", "last_review", "learning_steps") SELECT "card_id", "difficulty", "stability", "state", "due", "elapsed_days", "scheduled_days", "reps", "lapses", "last_review", "learning_steps" FROM `card_fsrs`;--> statement-breakpoint
DROP TABLE `card_fsrs`;--> statement-breakpoint
ALTER TABLE `__new_card_fsrs` RENAME TO `card_fsrs`;--> statement-breakpoint
CREATE TABLE `__new_cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`front` text NOT NULL,
	`back` text NOT NULL,
	`explanation` text,
	`options` text,
	`correct_indices` text,
	`created_at` integer DEFAULT 1780245111996 NOT NULL,
	`updated_at` integer DEFAULT 1780245111996 NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_cards`("id", "type", "front", "back", "explanation", "options", "correct_indices", "created_at", "updated_at") SELECT "id", "type", "front", "back", "explanation", "options", "correct_indices", "created_at", "updated_at" FROM `cards`;--> statement-breakpoint
DROP TABLE `cards`;--> statement-breakpoint
ALTER TABLE `__new_cards` RENAME TO `cards`;--> statement-breakpoint
CREATE TABLE `__new_exams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`bundle_id` integer,
	`question_count` integer NOT NULL,
	`time_limit_seconds` integer,
	`difficulty_filter` real,
	`points_per_correct` real DEFAULT 1 NOT NULL,
	`points_per_wrong` real DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT 1780245111996 NOT NULL,
	FOREIGN KEY (`bundle_id`) REFERENCES `bundles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_exams`("id", "title", "bundle_id", "question_count", "time_limit_seconds", "difficulty_filter", "points_per_correct", "points_per_wrong", "created_at") SELECT "id", "title", "bundle_id", "question_count", "time_limit_seconds", "difficulty_filter", "points_per_correct", "points_per_wrong", "created_at" FROM `exams`;--> statement-breakpoint
DROP TABLE `exams`;--> statement-breakpoint
ALTER TABLE `__new_exams` RENAME TO `exams`;--> statement-breakpoint
CREATE TABLE `__new_todos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT 1780245111997 NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_todos`("id", "title", "done", "created_at") SELECT "id", "title", "done", "created_at" FROM `todos`;--> statement-breakpoint
DROP TABLE `todos`;--> statement-breakpoint
ALTER TABLE `__new_todos` RENAME TO `todos`;