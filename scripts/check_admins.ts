import dotenv from 'dotenv';
dotenv.config();
import { db } from '../server/db.js';
import { users } from '../server/schema.js';
import { ilike } from 'drizzle-orm';

async function checkAdmin() {
    try {
        console.log('Checking database for admin users...');
        const adminUsers = await db.select().from(users).where(ilike(users.role, '%admin%'));
        console.log(`Found ${adminUsers.length} admin(s):`);
        adminUsers.forEach(u => {
            console.log(`- ID: ${u.id}, Username: ${u.username}, Email: ${u.email}, Role: ${u.role}`);
        });

        const ceoUsers = await db.select().from(users).where(ilike(users.role, '%ceo%'));
        console.log(`Found ${ceoUsers.length} CEO(s):`);
        ceoUsers.forEach(u => {
            console.log(`- ID: ${u.id}, Username: ${u.username}, Email: ${u.email}, Role: ${u.role}`);
        });

        process.exit(0);
    } catch (err) {
        console.error('Check failed:', err);
        process.exit(1);
    }
}

checkAdmin();
