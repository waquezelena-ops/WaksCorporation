// Applies only the new performance indexes from migration 0004.
// Run with: npx tsx scripts/apply_indexes.ts
import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, {
    ssl: { rejectUnauthorized: false },
    max: 1,
});

const indexes = [
    `CREATE INDEX IF NOT EXISTS "event_notifications_event_id_idx" ON "event_notifications" USING btree ("event_id")`,
    `CREATE INDEX IF NOT EXISTS "events_status_idx" ON "events" USING btree ("status")`,
    `CREATE INDEX IF NOT EXISTS "notifications_user_id_idx" ON "notifications" USING btree ("user_id")`,
    `CREATE INDEX IF NOT EXISTS "notifications_is_read_idx" ON "notifications" USING btree ("is_read")`,
    `CREATE INDEX IF NOT EXISTS "notifications_user_read_idx" ON "notifications" USING btree ("user_id","is_read")`,
    `CREATE INDEX IF NOT EXISTS "orders_user_id_idx" ON "orders" USING btree ("user_id")`,
    `CREATE INDEX IF NOT EXISTS "orders_product_id_idx" ON "orders" USING btree ("product_id")`,
    `CREATE INDEX IF NOT EXISTS "orders_status_idx" ON "orders" USING btree ("status")`,
    `CREATE INDEX IF NOT EXISTS "playbook_strategies_team_id_idx" ON "playbook_strategies" USING btree ("team_id")`,
    `CREATE INDEX IF NOT EXISTS "playbook_strategies_game_idx" ON "playbook_strategies" USING btree ("game")`,
    `CREATE INDEX IF NOT EXISTS "player_quota_progress_player_id_idx" ON "player_quota_progress" USING btree ("player_id")`,
    `CREATE INDEX IF NOT EXISTS "player_quota_progress_week_start_idx" ON "player_quota_progress" USING btree ("week_start")`,
    `CREATE INDEX IF NOT EXISTS "player_quota_progress_player_week_idx" ON "player_quota_progress" USING btree ("player_id","week_start")`,
    `CREATE INDEX IF NOT EXISTS "players_team_id_idx" ON "players" USING btree ("team_id")`,
    `CREATE INDEX IF NOT EXISTS "players_user_id_idx" ON "players" USING btree ("user_id")`,
    `CREATE INDEX IF NOT EXISTS "products_status_idx" ON "products" USING btree ("status")`,
    `CREATE INDEX IF NOT EXISTS "scrim_notifications_scrim_id_idx" ON "scrim_notifications" USING btree ("scrim_id")`,
    `CREATE INDEX IF NOT EXISTS "scrim_player_stats_scrim_id_idx" ON "scrim_player_stats" USING btree ("scrim_id")`,
    `CREATE INDEX IF NOT EXISTS "scrim_player_stats_player_id_idx" ON "scrim_player_stats" USING btree ("player_id")`,
    `CREATE INDEX IF NOT EXISTS "scrims_team_id_idx" ON "scrims" USING btree ("team_id")`,
    `CREATE INDEX IF NOT EXISTS "scrims_status_idx" ON "scrims" USING btree ("status")`,
    `CREATE INDEX IF NOT EXISTS "sponsors_user_id_idx" ON "sponsors" USING btree ("user_id")`,
    `CREATE INDEX IF NOT EXISTS "teams_manager_id_idx" ON "teams" USING btree ("manager_id")`,
    `CREATE INDEX IF NOT EXISTS "teams_game_idx" ON "teams" USING btree ("game")`,
    `CREATE INDEX IF NOT EXISTS "tournament_notifications_tournament_id_idx" ON "tournament_notifications" USING btree ("tournament_id")`,
    `CREATE INDEX IF NOT EXISTS "tournament_player_stats_tournament_id_idx" ON "tournament_player_stats" USING btree ("tournament_id")`,
    `CREATE INDEX IF NOT EXISTS "tournament_player_stats_player_id_idx" ON "tournament_player_stats" USING btree ("player_id")`,
    `CREATE INDEX IF NOT EXISTS "tournaments_team_id_idx" ON "tournaments" USING btree ("team_id")`,
    `CREATE INDEX IF NOT EXISTS "tournaments_status_idx" ON "tournaments" USING btree ("status")`,
    `CREATE INDEX IF NOT EXISTS "weekly_reports_week_start_idx" ON "weekly_reports" USING btree ("week_start")`,
];

(async () => {
    console.log('[Indexes] Applying performance indexes...');
    let ok = 0; let failed = 0;
    for (const stmt of indexes) {
        const name = stmt.match(/"([^"]+)"\s+ON/)?.[1] ?? 'unknown';
        try {
            await sql.unsafe(stmt);
            console.log(`  ✓ ${name}`);
            ok++;
        } catch (e: any) {
            console.error(`  ✗ ${name}: ${e.message}`);
            failed++;
        }
    }
    console.log(`\n[Indexes] Done: ${ok} applied, ${failed} failed.`);
    await sql.end();
    process.exit(failed > 0 ? 1 : 0);
})();
