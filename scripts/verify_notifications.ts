
import { db } from '../server/db';
import { notifications, users, teams, scrims, players } from '../server/schema';
import { eq, desc } from 'drizzle-orm';
import 'dotenv/config';

async function testNotificationFlow() {
    console.log('🧪 Starting Notification Flow Verification...');

    try {
        // 1. Get a test user (Manager)
        const managers = await db.select().from(users).where(eq(users.role, 'manager')).limit(1);
        if (managers.length === 0) throw new Error('No manager found for testing');
        const manager = managers[0];

        // 2. Get the team they manage
        const ownedTeams = await db.select().from(teams).where(eq(teams.id, 1)).limit(1); // Assuming team 1 exists
        if (ownedTeams.length === 0) throw new Error('Test team 1 not found');
        const team = ownedTeams[0];

        console.log(`📡 Scheduling test scrim for Team: ${team.name} as Manager: ${manager.username}`);

        // 3. Hit the API to create a scrim
        const baseUrl = process.env.VITE_API_BASE_URL || 'http://localhost:3001';
        const response = await fetch(`${baseUrl}/api/scrims`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                teamId: team.id,
                date: new Date(Date.now() + 86400000).toISOString(),
                opponent: "TEST_BOT_OPPONENT",
                format: "BO3",
                requesterId: manager.id
            })
        });

        const result = await response.json() as any;

        if (!result.success) throw new Error('API failed to create scrim: ' + result.error);
        console.log('✅ Scrim created via API');

        // 4. Verify notifications table for new records
        console.log('🔍 Checking notifications table for new alerts...');
        const recentNotifs = await db.select()
            .from(notifications)
            .where(eq(notifications.title, 'New Scrim Scheduled'))
            .orderBy(desc(notifications.createdAt))
            .limit(10);

        if (recentNotifs.length > 0) {
            console.log(`🎉 SUCCESS! Found ${recentNotifs.length} notifications generated for this scrim.`);
            recentNotifs.forEach(n => {
                console.log(`   - To User ID ${n.userId}: ${n.message}`);
            });
        } else {
            console.log('❌ FAILURE: No notifications found in the database.');
        }

    } catch (err: any) {
        console.error('❌ Verification Error:', err.message);
    } finally {
        process.exit();
    }
}

testNotificationFlow();
