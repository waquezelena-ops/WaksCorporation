import dotenv from 'dotenv';
dotenv.config();
import { db } from '../server/db.js';
import { users } from '../server/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

async function testLogin() {
    const username = "admin";
    const password = "Elle070199!!";

    console.log(`Testing login for ${username}...`);
    const userRows = await db.select().from(users).where(eq(users.username, username)).limit(1);
    const user = userRows[0];

    if (!user) {
        console.error("User not found in DB!");
        process.exit(1);
    }

    console.log("User found. Verifying password...");
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (isMatch) {
        console.log("SUCCESS: Password matches!");
    } else {
        console.error("FAILURE: Password does NOT match!");
        console.log("Stored hash:", user.password);
    }
    process.exit(0);
}

testLogin().catch(console.error);
