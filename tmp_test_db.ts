
import { db } from './server/db';
import { users, players, teams, scrims } from './server/schema';
import { eq, sql, and } from 'drizzle-orm';

async function testFailingQuery() {
    const requesterId = 92;
    try {
        console.log("Testing EXISTS query...");
        let q = db.select().from(scrims);

        // This is the logic from GET /api/scrims when !isAdmin && requesterId
        q = q.where(
            sql`EXISTS (
                SELECT 1 FROM ${teams} 
                WHERE ${teams.id} = ${scrims.teamId} 
                AND (${teams.managerId} = ${Number(requesterId)} 
                     OR EXISTS (SELECT 1 FROM ${players} WHERE ${players.teamId} = ${teams.id} AND ${players.userId} = ${Number(requesterId)}))
            )`
        );

        const data = await q;
        console.log("Success! Found scrims:", data.length);
    } catch (err: any) {
        console.error("FAILED QUERY:", err.message);
        // Drizzle errors often have the query and params
        console.error("FULL ERROR:", err);
    }
}

testFailingQuery().then(() => process.exit(0));
