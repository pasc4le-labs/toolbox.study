CREATE TABLE IF NOT EXISTS `todos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT 1779069418057 NOT NULL
);
