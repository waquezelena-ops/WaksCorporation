CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"type" text NOT NULL,
	"is_read" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "playbook_strategies" ADD COLUMN "game" text;--> statement-breakpoint
ALTER TABLE "playbook_strategies" ADD COLUMN "role" text;--> statement-breakpoint
ALTER TABLE "playbook_strategies" ADD COLUMN "video_url" text;--> statement-breakpoint
ALTER TABLE "playbook_strategies" ADD COLUMN "author_id" integer;--> statement-breakpoint
ALTER TABLE "player_quota_progress" ADD COLUMN "is_custom_quota_applied" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_is_read_idx" ON "notifications" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","is_read");--> statement-breakpoint
ALTER TABLE "playbook_strategies" ADD CONSTRAINT "playbook_strategies_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_notifications_event_id_idx" ON "event_notifications" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "events_status_idx" ON "events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_user_id_idx" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "orders_product_id_idx" ON "orders" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "playbook_strategies_team_id_idx" ON "playbook_strategies" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "playbook_strategies_game_idx" ON "playbook_strategies" USING btree ("game");--> statement-breakpoint
CREATE INDEX "player_quota_progress_player_id_idx" ON "player_quota_progress" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "player_quota_progress_week_start_idx" ON "player_quota_progress" USING btree ("week_start");--> statement-breakpoint
CREATE INDEX "player_quota_progress_player_week_idx" ON "player_quota_progress" USING btree ("player_id","week_start");--> statement-breakpoint
CREATE INDEX "players_team_id_idx" ON "players" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "players_user_id_idx" ON "players" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "products_status_idx" ON "products" USING btree ("status");--> statement-breakpoint
CREATE INDEX "scrim_notifications_scrim_id_idx" ON "scrim_notifications" USING btree ("scrim_id");--> statement-breakpoint
CREATE INDEX "scrim_player_stats_scrim_id_idx" ON "scrim_player_stats" USING btree ("scrim_id");--> statement-breakpoint
CREATE INDEX "scrim_player_stats_player_id_idx" ON "scrim_player_stats" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "scrims_team_id_idx" ON "scrims" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "scrims_status_idx" ON "scrims" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sponsors_user_id_idx" ON "sponsors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "teams_manager_id_idx" ON "teams" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "teams_game_idx" ON "teams" USING btree ("game");--> statement-breakpoint
CREATE INDEX "tournament_notifications_tournament_id_idx" ON "tournament_notifications" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "tournament_player_stats_tournament_id_idx" ON "tournament_player_stats" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "tournament_player_stats_player_id_idx" ON "tournament_player_stats" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "tournaments_team_id_idx" ON "tournaments" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "tournaments_status_idx" ON "tournaments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "weekly_reports_week_start_idx" ON "weekly_reports" USING btree ("week_start");