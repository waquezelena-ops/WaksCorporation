
import { db } from './server/db';
import { scrimPlayerStats, tournamentPlayerStats, scrims, tournaments } from './server/schema';
import { eq, and } from 'drizzle-orm';

async function checkStats() {
    console.log("--- SCRIM STATS ---");
    const sStats = await db.select().from(scrimPlayerStats);
    const sDraws = sStats.filter(s => s.isWin === 2);
    console.log(`Total Scrim Player Stats: ${sStats.length}`);
    console.log(`Scrim Draw Stats (isWin=2): ${sDraws.length}`);

    if (sDraws.length > 0) {
        console.log("Sample Scrim Draw Stat:", sDraws[0]);
        const scrim = await db.select().from(scrims).where(eq(scrims.id, Number(sDraws[0].scrimId))).limit(1);
        console.log("Associated Scrim Results:", scrim[0]?.results);
    }

    console.log("\n--- TOURNAMENT STATS ---");
    const tStats = await db.select().from(tournamentPlayerStats);
    const tDraws = tStats.filter(t => t.isWin === 2);
    console.log(`Total Tournament Player Stats: ${tStats.length}`);
    console.log(`Tournament Draw Stats (isWin=2): ${tDraws.length}`);

    if (tDraws.length > 0) {
        console.log("Sample Tournament Draw Stat:", tDraws[0]);
        const tourney = await db.select().from(tournaments).where(eq(tournaments.id, Number(tDraws[0].tournamentId))).limit(1);
        console.log("Associated Tournament Results:", tourney[0]?.results);
    }
}

checkStats().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
