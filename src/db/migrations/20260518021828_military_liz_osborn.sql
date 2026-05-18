CREATE TABLE `bundle_cards` (
	`card_id` integer NOT NULL,
	`bundle_id` integer NOT NULL,
	PRIMARY KEY(`card_id`, `bundle_id`),
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bundle_id`) REFERENCES `bundles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `bundles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`created_at` integer DEFAULT 1779070708368 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `card_tags` (
	`card_id` integer NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`card_id`, `tag`),
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`front` text NOT NULL,
	`back` text NOT NULL,
	`explanation` text,
	`created_at` integer DEFAULT 1779070708368 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `todos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT 1779070708369 NOT NULL
);
