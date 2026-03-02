
import { db } from '../server/db';
import { notifications, users, teams, players, scrims } from '../server/schema';
import { eq, inArray } from 'drizzle-orm';
import 'dotenv/config';

async function verifyFullFlow() {
    console.log('🧪 Starting Full Notification Flow Verification...');
    const testIds: { users: number[], teams: number[], players: number[] } = { users: [], teams: [], players: [] };

    try {
        // 1. Create Test Manager
        console.log('👤 Creating Test Manager...');
        const [manager] = await db.insert(users).values({
            username: `test_manager_${Date.now()}`,
            password: 'password',
            email: `manager_${Date.now()}@test.com`,
            fullname: 'Test Manager',
            role: 'manager'
        }).returning();
        testIds.users.push(manager.id);

        // 2. Create Test Team
        console.log('🛡️ Creating Test Team...');
        const [team] = await db.insert(teams).values({
            name: `Test Team ${Date.now()}`,
            managerId: manager.id,
            game: 'Valorant'
        }).returning();
        testIds.teams.push(team.id);

        // 3. Create Test Player User & Player record
        console.log('🎮 Creating Test Player...');
        const [playerUser] = await db.insert(users).values({
            username: `test_player_${Date.now()}`,
            password: 'password',
            email: `player_${Date.now()}@test.com`,
            fullname: 'Test Player',
            role: 'player'
        }).returning();
        testIds.users.push(playerUser.id);

        const [playerRecord] = await db.insert(players).values({
            teamId: team.id,
            userId: playerUser.id,
            name: 'Test Player IGN',
            role: 'Duelist'
        }).returning();
        testIds.players.push(playerRecord.id);

        // 4. Trigger Scrim via API
        console.log('🚀 Triggering Scrim Creation via API...');
        const baseUrl = process.env.VITE_API_BASE_URL || 'http://localhost:3001';
        const response = await fetch(`${baseUrl}/api/scrims`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                teamId: team.id,
                date: new Date(Date.now() + 86400000).toISOString(),
                opponent: "LOGIC_VERIFIER_BOT",
                format: "BO1",
                maps: ["Ascent"],
                requesterId: manager.id
            })
        });

        const result = await response.json() as any;
        if (!result.success) throw new Error('API Request Failed: ' + result.error);
        console.log('✅ Scrim created successfully.');

        // 5. Verify Notifications
        console.log('🔍 Verifying Notification Records...');
        const managerNotifs = await db.select().from(notifications).where(eq(notifications.userId, manager.id));
        const playerNotifs = await db.select().from(notifications).where(eq(notifications.userId, playerUser.id));

        console.log(`📊 Results:`);
        console.log(`   - Manager Notifications: ${managerNotifs.length} (Expected: 1)`);
        console.log(`   - Player Notifications: ${playerNotifs.length} (Expected: 1)`);

        if (managerNotifs.length === 1 && playerNotifs.length === 1) {
            console.log('🎉 SUCCESS: Notification logic is CORRECT!');
            console.log(`📝 Sample Message: "${playerNotifs[0].message}"`);
        } else {
            console.log('❌ FAILURE: Notification counts do not match expectations.');
        }

    } catch (err: any) {
        console.error('❌ Verification Failed:', err.message);
    } finally {
        console.log('🧹 Cleaning up test data...');
        // Cleanup in reverse order of creation
        if (testIds.players.length) await db.delete(players).where(inArray(players.id, testIds.players));
        if (testIds.teams.length) {
            await db.delete(scrims).where(inArray(scrims.teamId, testIds.teams));
            await db.delete(teams).where(inArray(teams.id, testIds.teams));
        }
        if (testIds.users.length) {
            await db.delete(notifications).where(inArray(notifications.userId, testIds.users));
            await db.delete(users).where(inArray(users.id, testIds.users));
        }
        console.log('✨ Cleanup complete.');
        process.exit();
    }
}

verifyFullFlow();
