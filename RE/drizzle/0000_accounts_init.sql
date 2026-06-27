CREATE TABLE `accounts` (
	`account` text PRIMARY KEY NOT NULL,
	`salt` text NOT NULL,
	`hash` text NOT NULL,
	`created_at` text,
	`characters_json` text DEFAULT '[]' NOT NULL
);
