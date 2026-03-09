import dotenv from 'dotenv';
dotenv.config();
import { db } from '../server/db.js';
import { users } from '../server/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

async function resetAdminPassword() {
    try {
        console.log('Searching for admin/ceo users...');
        const allUsers = await db.select().from(users);
        const adminUsers = allUsers.filter(u => 
            u.role?.toLowerCase().includes('admin') || 
            u.role?.toLowerCase().includes('ceo')
        );

        if (adminUsers.length === 0) {
            console.error('No admin or CEO users found in the database.');
            process.exit(1);
        }

        console.log(`Found ${adminUsers.length} admin/CEO account(s):`);
        adminUsers.forEach(u => console.log(`- ${u.email} (ID: ${u.id}, Role: ${u.role})`));

        const newPassword = "Elle070199!!";
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        for (const admin of adminUsers) {
            console.log(`Updating password for ${admin.email}...`);
            await db.update(users)
                .set({ password: hashedPassword })
                .where(eq(users.id, admin.id));
        }

        console.log('Successfully updated password(s) to: Elle070199!!');
        process.exit(0);
    } catch (error) {
        console.error('Error resetting password:', error);
        process.exit(1);
    }
}

resetAdminPassword();
