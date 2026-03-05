import dotenv from 'dotenv';
import { resolve } from 'path';

// Force load .env
dotenv.config();
console.log('--- SERVER STARTUP ---');
console.log('[DIAG] NODE_ENV:', process.env.NODE_ENV);
console.log('[DIAG] DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('[DIAG] VITE_API_BASE_URL:', process.env.VITE_API_BASE_URL);
console.log('[DIAG] GEMINI_API_KEY loaded:', !!process.env.GEMINI_API_KEY);
console.log('[DIAG] Current Dir:', process.cwd());

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { db } from './db.js';
import { users, achievements, events, sponsors, teams, players, scrims, scrimPlayerStats, tournaments, tournamentPlayerStats, tournamentNotifications, weeklyReports, rosterQuotas, playerQuotaProgress, products, orders, siteSettings, playbookStrategies, notifications } from './schema.js';
import { eq, inArray, and, or, sql, desc, notIlike, isNull, isNotNull } from 'drizzle-orm';
import crypto from 'crypto';
import fs from 'fs';
import { finished } from 'stream/promises';

// Forward declaration for Cron/Scheduler
let checkAllNotifications: () => Promise<void>;
let initDiscord: () => void;
let initScheduler: (onWeeklyReportTrigger?: () => Promise<any>) => void;

const GAME_CATEGORY = {
    'Valorant': 'VALORANT',
    'Valorant Mobile': 'VALORANT',
    'CS2': 'FPS',
    'CS:GO': 'FPS',
    'Apex Legends': 'BR',
    'League of Legends': 'MOBA',
    'Dota 2': 'MOBA',
    'Mobile Legends': 'MOBA',
    'Mobile Legends: Bang Bang': 'MOBA',
    'Honor of Kings': 'MOBA'
} as const;

const app = express();
app.set('trust proxy', 1); // Trust Vercel proxy for express-rate-limit
console.log('[DEBUG] server/index.ts is executing...');

const IS_PROD = process.env.NODE_ENV === 'production';

// ── Security: Helmet (security headers) ──────────────────────────────────────
app.use(helmet({
    crossOriginEmbedderPolicy: false, // needed for image loading from external CDNs
    contentSecurityPolicy: false,     // managed by Vite in dev; can tighten in prod later
}));

// ── Security: CORS whitelist ──────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'http://localhost:4173',
    'http://localhost',      // Android Capacitor
    'capacitor://localhost', // iOS Capacitor
    ...(process.env.ALLOWED_ORIGIN ? [process.env.ALLOWED_ORIGIN] : []),
];
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (server-to-server, curl, mobile apps)
        if (!origin) return callback(null, true);

        // Check whitelist
        if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);

        // Allow all Vercel subdomains
        if (origin.endsWith('.vercel.app')) return callback(null, true);

        callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: true,
}));

// ── Security: Rate limiters ───────────────────────────────────────────────────
const authLimiter = rateLimit({
    windowMs: 60 * 1000,   // 1 minute
    max: 10,               // 10 attempts per minute per IP on auth routes
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests, please try again later.' },
});
const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 150,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests, please try again later.' },
});
app.use(globalLimiter);
app.use('/api/auth', authLimiter);

// ── Diagnostic Logger ─────────────────────────────────────────────────────────
app.use((req, res, next) => {
    if (!IS_PROD) console.log(`[${new Date().toISOString()}] REQ: ${req.method} ${req.url}`);
    next();
});

// ── Body limits ───────────────────────────────────────────────────────────────
// Avatar/image uploads / QR / Payment Proofs get 50 MB; everything else gets 5 MB
app.use('/api/users/:id/avatar', express.json({ limit: '50mb' }));
app.use('/api/users/:id/avatar', express.urlencoded({ limit: '50mb', extended: true }));
app.use('/api/sponsors/:id/qr', express.json({ limit: '50mb' }));
app.use('/api/site-settings', express.json({ limit: '50mb' }));
app.use('/api/orders', express.json({ limit: '50mb' }));
// ── Real-time Support (SSE) ───────────────────────────────────────────────────
let sseClients: { id: number, res: express.Response }[] = [];

app.get('/api/realtime', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // Disable buffering on Nginx / Vercel so events are flushed immediately
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const clientId = Date.now();
    const newClient = { id: clientId, res };
    sseClients.push(newClient);

    console.log(`[Realtime] Sync channel established for client ${clientId}. Total: ${sseClients.length}`);

    // Heartbeat — keep the connection alive through proxies that kill idle streams
    const heartbeat = setInterval(() => {
        try {
            res.write(': heartbeat\n\n');
        } catch {
            clearInterval(heartbeat);
            sseClients = sseClients.filter(c => c.id !== clientId);
        }
    }, 25000);

    req.on('close', () => {
        clearInterval(heartbeat);
        sseClients = sseClients.filter(c => c.id !== clientId);
        console.log(`[Realtime] Sync channel closed for client ${clientId}. Total: ${sseClients.length}`);
    });
});

const notifyRefresh = () => {
    // Bust the in-memory cache so next request re-fetches fresh data
    invalidateCache();
    if (sseClients.length === 0) return;
    console.log(`[Realtime] Broadcasting global refresh signal to ${sseClients.length} clients...`);
    // Write safely — remove any client whose connection is dead
    const dead: number[] = [];
    sseClients.forEach(client => {
        try {
            client.res.write('data: refresh\n\n');
        } catch (e) {
            console.warn(`[Realtime] Dead client ${client.id} evicted.`);
            dead.push(client.id);
        }
    });
    if (dead.length > 0) {
        sseClients = sseClients.filter(c => !dead.includes(c.id));
    }
};

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));

const PORT = Number(process.env.PORT) || 3001;

// ── In-memory Response Cache ───────────────────────────────────────────────────
// MUST be defined before notifyRefresh() so invalidateCache() is in scope
const cache = new Map<string, { data: any; expiry: number }>();
const CACHE_TTL_MS = 30_000; // 30 seconds default
const getCache = (key: string): any | null => {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) { cache.delete(key); return null; }
    return entry.data;
};
const setCache = (key: string, data: any, ttl = CACHE_TTL_MS) => {
    cache.set(key, { data, expiry: Date.now() + ttl });
};
const invalidateCache = () => cache.clear();


// Test Route for Discord Notification (Moved to top for debugging)
app.post('/api/test/notification', async (req, res) => {
    console.log('[DEBUG] Hit /api/test/notification route (TOP)');
    try {
        const { sendAIEventNotification } = await import('./scheduler.js');
        const dummyEvent = {
            title: "NOW RECRUITING: WC Solana (VALORANT PC)",
            description: "WC is officially expanding our VALORANT PC FEMALE DIVISION with the launch of WC Solana. We are looking for high potential players ready to build a legacy suitable for elite community leagues.\n\nRequirements:\n- Gender: Female\n- Rank: Diamond - Immortal\n- Team Size: 5 Main + 2 Subs\n- Commitment: Available for scrims/VODs.",
            location: "Discord Ticket #player-applications",
            date: new Date().toISOString()
        };

        await sendAIEventNotification(dummyEvent, 'TEST');
        res.json({ success: true, message: "Test notification sent to Discord." });
    } catch (error) {
        console.error("Test notification failed:", error);
        res.status(500).json({ success: false, error: "Failed to send test notification." });
    }
});

// Legacy SHA-256 hash (used before bcrypt migration)
const legacyHash = (password: string): string =>
    crypto.createHash('sha256').update(password).digest('hex');

// Hash a password with bcrypt (async)
const hashPassword = async (password: string): Promise<string> =>
    bcrypt.hash(password, 12);

// Verify password — handles both bcrypt and legacy SHA-256 (auto-migrates)
const verifyPassword = async (
    plain: string,
    stored: string,
    userId: number
): Promise<boolean> => {
    // Detect legacy SHA-256 hash: 64-char hex string
    const isLegacy = /^[0-9a-f]{64}$/.test(stored);
    if (isLegacy) {
        if (legacyHash(plain) !== stored) return false;
        // Auto-migrate to bcrypt silently
        const newHash = await bcrypt.hash(plain, 12);
        await db.update(users).set({ password: newHash }).where(eq(users.id, userId));
        console.log(`[AUTH] Migrated password for userId ${userId} from SHA-256 to bcrypt`);
        return true;
    }
    return bcrypt.compare(plain, stored);
};

// Sanitize user-provided strings — strips all HTML tags and dangerous URI schemes.
// This prevents XSS via <script>, <img onerror>, <svg onload>, javascript: hrefs, etc.
const sanitize = (val: any): string => {
    if (typeof val !== 'string') return String(val ?? '');
    return val
        .trim()
        // Remove all HTML/XML tags
        .replace(/<[^>]*>/gi, '')
        // Remove dangerous URI protocols (javascript:, data:, vbscript:)
        .replace(/\b(javascript|data|vbscript):/gi, '');
};


// Website Notifications Utility
const sendWebsiteNotification = async (teamId: number, title: string, message: string, type: 'scrim' | 'tournament') => {
    try {
        const userIds = new Set<number>();

        // 1. Get the team manager
        const teamRows = await db.select().from(teams).where(eq(teams.id, teamId));
        const team = teamRows[0];
        if (team?.managerId) userIds.add(team.managerId);

        // 2. Get all players and coach of the team from players table
        const teamPlayers = await db.select().from(players).where(eq(players.teamId, teamId));
        teamPlayers.forEach(p => {
            if (p.userId) userIds.add(p.userId);
        });

        // 3. Create notifications for each unique user
        const notificationEntries = Array.from(userIds).map(uid => ({
            userId: uid,
            title,
            message,
            type,
            isRead: false
        }));

        if (notificationEntries.length > 0) {
            await db.insert(notifications).values(notificationEntries);
            console.log(`[NOTIFICATIONS] Dispatched ${notificationEntries.length} alerts for team ${teamId} (${type})`);
        }
    } catch (err) {
        console.error('[NOTIFICATIONS ERROR] Failed to dispatch website notifications:', err);
    }
};

// Calculate role-based level
const determineLevel = (role: string | null, xpLevel: number | null): number => {
    const roles = (role || 'member').split(',').map(r => r.trim().toLowerCase());
    if (roles.includes('admin')) return 1000000000000;
    if (roles.includes('ceo')) return 1000000000;
    if (roles.includes('manager') || roles.includes('coach')) return 1000000;
    // Use Math.max to ensure level is never 0 (DB default=1 can be bypassed),
    // and handle null xpLevel gracefully.
    return Math.max(xpLevel ?? 0, 1);
};



// --- ROUTES ---

app.get('/ping', (req, res) => {
    res.json({ status: 'ok', server: 'Identity Service' });
});

app.get('/api/diag', async (req, res) => {
    try {
        console.log('[AUTH TRACE] Running /api/diag...');
        const dbInfo = await db.execute(sql`SELECT current_database(), current_user, inet_server_addr(), version()`);
        const userCountRes = await db.select({ count: sql`count(*)` }).from(users);

        res.json({
            success: true,
            dbInfo: dbInfo[0],
            userCount: userCountRes[0].count,
            env: {
                NODE_ENV: process.env.NODE_ENV,
                DATABASE_URL_SET: !!process.env.DATABASE_URL,
                DATABASE_URL_PORT: process.env.DATABASE_URL?.split(':')[3]?.split('/')[0] || 'unknown'
            }
        });
    } catch (err: any) {
        console.error('[DIAG ERROR]', err);
        res.status(500).json({
            success: false,
            error: err.message,
            stack: err.stack,
            hint: "Check if the database user has permissions for these queries."
        });
    }
});

app.get('/api/health', async (req, res) => {
    let dbStatus = 'NOT CHECKED';
    let dbError = null;

    if (db) {
        try {
            // Simple query to verify connection and table existence
            await db.select({ id: users.id }).from(users).limit(1);
            dbStatus = 'CONNECTED';
        } catch (err: any) {
            dbStatus = 'CONNECTION_FAILED';
            dbError = err.message || 'Unknown database error';
            console.error('[HEALTH] DB Connectivity check failed:', err);
            // Log full stack in internal diagnostic
            if (!IS_PROD) console.error(err.stack);
        }
    } else {
        dbStatus = 'NOT_INITIALIZED';
    }

    res.json({
        status: 'UP',
        nodeEnv: process.env.NODE_ENV,
        dbStatus,
        dbError: IS_PROD ? (dbError ? 'REDACTED' : null) : dbError,
        hasDbUrl: !!process.env.DATABASE_URL,
        dbUrlPrefix: process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 15) + '...' : 'none',
        hasGeminiKey: !!process.env.GEMINI_API_KEY,
        hasDiscordToken: !!process.env.DISCORD_BOT_TOKEN,
        timestamp: new Date().toISOString(),
        version: '1.0.3-final-resilience'
    });
});

// Users
app.get('/api/users', async (req, res) => {
    try {
        const allUsers = await db.select({
            id: users.id,
            username: users.username,
            email: users.email,
            fullname: users.fullname,
            googleId: users.googleId,
            avatar: users.avatar,
            role: users.role,
            bio: users.bio,
            gamesPlayed: users.gamesPlayed,
            achievements: users.achievements,
            birthday: users.birthday,
            createdAt: users.createdAt,
            ign: users.ign,
            level: players.level,
            xp: players.xp
        })
            .from(users)
            .leftJoin(players, eq(users.id, players.userId));

        // Deduplicate users (due to left join with players)
        const userMap = new Map();
        allUsers.forEach(u => {
            if (!userMap.has(u.id)) {
                userMap.set(u.id, {
                    ...u,
                    level: determineLevel(u.role, u.level)
                });
            } else {
                // Keep the highest level if multiple records exist
                const existing = userMap.get(u.id);
                const currentLevel = determineLevel(u.role, u.level);
                if (currentLevel > existing.level) {
                    userMap.set(u.id, { ...u, level: currentLevel });
                }
            }
        });

        res.json(Array.from(userMap.values()));
    } catch (error: any) {
        console.error("Error in GET /api/users:", error.stack || error);
        res.status(500).json({ success: false, error: 'Failed to fetch users', details: IS_PROD ? 'Check server logs' : error.message });
    }
});

app.post('/api/auth/signup', async (req, res) => {
    const { fullname, username, email, password } = req.body;
    if (!fullname || !username || !email || !password) return res.status(400).json({ success: false, error: 'Missing required signup fields' });

    const sFullname = sanitize(fullname);
    const sUsername = sanitize(username);
    const sEmail = sanitize(email).toLowerCase();

    try {
        const hashedPassword = await hashPassword(password);
        const newUserRows = await db.insert(users).values({
            fullname: sFullname,
            username: sUsername,
            email: sEmail,
            password: hashedPassword,
            role: 'member'
        }).returning();
        const newUser = newUserRows[0];
        // SECURITY: Never return the password hash to the client
        const { password: _pw, ...safeNewUser } = newUser as any;
        notifyRefresh();
        res.json({ success: true, message: 'Signup success', data: safeNewUser });
    } catch (error: any) {
        console.error("Error in POST /api/auth/signup:", error);
        // Surface human-readable duplicate key errors
        let userFacingError = 'Signup failed';
        if (error.message?.includes('UNIQUE') || error.message?.includes('unique')) {
            if (error.message?.includes('username')) userFacingError = 'Username is already taken.';
            else if (error.message?.includes('email')) userFacingError = 'Email is already registered.';
            else userFacingError = 'Username or email already exists.';
        }
        res.status(500).json({ success: false, error: userFacingError, details: IS_PROD ? undefined : error.message });
    }
});


app.post('/api/auth/login', async (req, res) => {
    console.log('[AUTH TRACE] 1. Request received for /api/auth/login');
    const { username, password } = req.body;
    const sUsername = sanitize(username);
    try {
        console.log(`[AUTH TRACE] 2. Login attempt for: ${sUsername}`);

        // Single query: fetch user + player data together (avoids a 2nd DB round-trip after password check)
        const userRows = await db.select({
            id: users.id,
            username: users.username,
            email: users.email,
            fullname: users.fullname,
            googleId: users.googleId,
            avatar: users.avatar,
            role: users.role,
            bio: users.bio,
            gamesPlayed: users.gamesPlayed,
            achievements: users.achievements,
            birthday: users.birthday,
            createdAt: users.createdAt,
            ign: users.ign,
            password: users.password, // needed for verification; stripped before response
            xp: players.xp,
            playerImage: players.image
        })
            .from(users)
            .leftJoin(players, eq(users.id, players.userId))
            .where(eq(users.username, sUsername))
            .limit(1);

        console.log(`[AUTH TRACE] 3. DB Lookup finished. Rows: ${userRows.length}`);
        const userRow = userRows[0];

        if (!userRow) {
            console.log(`[AUTH TRACE] 4a. User not found: ${sUsername}`);
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        console.log('[AUTH TRACE] 4b. Verifying password...');
        const isPasswordValid = await verifyPassword(password, userRow.password, userRow.id);
        console.log(`[AUTH TRACE] 5. Password check result: ${isPasswordValid}`);

        if (!isPasswordValid) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        // Strip password before sending; compute role-based level
        const { password: _pw, ...safeUser } = userRow as any;
        safeUser.level = determineLevel(safeUser.role, safeUser.level);
        if (!safeUser.avatar && safeUser.playerImage) {
            safeUser.avatar = safeUser.playerImage;
        }

        console.log('[AUTH TRACE] 6. Login success. Sending response.');
        res.json({ success: true, message: 'Login success', data: safeUser });
    } catch (error: any) {
        console.error('[AUTH TRACE] CRITICAL ERROR in /api/auth/login:', error);
        res.status(500).json({ success: false, error: 'Login failure', details: IS_PROD ? undefined : error.message });
    }
});


// NOTE: Global error handler is registered AFTER all routes at the bottom of this file.
// Express requires the error handler (4-arg middleware) to be the LAST middleware registered.
// If placed here, errors thrown in routes registered below this line are not caught.

app.post('/api/users/sync', async (req, res) => {
    let { googleId, email, name, avatar, birthday, role: requestedRole } = req.body;
    email = email?.toLowerCase();
    if (!email) return res.status(400).json({ error: 'Missing email' });
    try {
        let existingUserRows = googleId
            ? await db.select().from(users).where(eq(users.googleId, googleId))
            : await db.select().from(users).where(eq(users.email, email));
        let existingUser = existingUserRows[0];

        if (existingUser) {
            const updateSet: any = { avatar, googleId };
            if (name) updateSet.fullname = name;
            if (birthday) updateSet.birthday = birthday;
            // SECURITY: Role changes are NOT allowed via sync — use PUT /api/users/:id/role (admin-only)
            // Removing requestedRole from this update prevents privilege escalation attacks.
            await db.update(users).set(updateSet).where(eq(users.id, existingUser.id));

            // Re-fetch with player data
            const updatedUserRows = await db.select({
                id: users.id,
                username: users.username,
                email: users.email,
                fullname: users.fullname,
                googleId: users.googleId,
                avatar: users.avatar,
                role: users.role,
                bio: users.bio,
                gamesPlayed: users.gamesPlayed,
                achievements: users.achievements,
                birthday: users.birthday,
                createdAt: users.createdAt,
                ign: users.ign,
                level: players.level,
                xp: players.xp,
                playerImage: players.image
            })
                .from(users)
                .leftJoin(players, eq(users.id, players.userId))
                .where(eq(users.id, existingUser.id));

            const updatedUser = updatedUserRows[0];

            if (updatedUser) {
                (updatedUser as any).level = determineLevel(updatedUser.role, updatedUser.level);
                if (!updatedUser.avatar && (updatedUser as any).playerImage) {
                    updatedUser.avatar = (updatedUser as any).playerImage;
                }
            }

            notifyRefresh();
            return res.json({ message: 'User synced', user: updatedUser });
        } else {
            if (!googleId) return res.status(404).json({ error: 'Sign up first' });
            const sUsername = sanitize(email.split('@')[0] + '_' + Math.floor(Math.random() * 1000));
            const hashedPassword = await hashPassword('google_authenticated');
            const newUserRes = await db.insert(users).values({
                username: sUsername,
                password: hashedPassword,
                googleId, email, fullname: sanitize(name) || 'Waks Agent',
                avatar, birthday, role: email === 'admin@waks.com' ? 'admin' : 'member'
            }).returning();
            const newUser = newUserRes[0];

            // For new users, they won't have player data yet, but let's be consistent
            const enrichedNewUserRows = await db.select({
                id: users.id,
                username: users.username,
                email: users.email,
                fullname: users.fullname,
                googleId: users.googleId,
                avatar: users.avatar,
                role: users.role,
                bio: users.bio,
                gamesPlayed: users.gamesPlayed,
                achievements: users.achievements,
                birthday: users.birthday,
                createdAt: users.createdAt,
                ign: users.ign,
                level: players.level,
                xp: players.xp
            })
                .from(users)
                .leftJoin(players, eq(users.id, players.userId))
                .where(eq(users.id, newUser.id));
            const enrichedNewUser = enrichedNewUserRows[0];

            if (enrichedNewUser) {
                (enrichedNewUser as any).level = determineLevel(enrichedNewUser.role, enrichedNewUser.level);
            }

            notifyRefresh();
            return res.json({ success: true, message: 'User created', data: enrichedNewUser });
        }
    } catch (error: any) {
        console.error("Error in POST /api/users/sync:", error);
        res.status(500).json({ success: false, error: 'Sync failed', details: IS_PROD ? undefined : error.message });
    }
});

app.put('/api/users/:id/role', async (req, res) => {
    const { id } = req.params;
    const { role, requesterId } = req.body;
    if (!requesterId) return res.status(400).json({ success: false, error: 'Missing requesterId' });
    try {
        // Auth guard: only admins/CEO can change roles
        const requesterRows = await db.select().from(users).where(eq(users.id, Number(requesterId)));
        const requester = requesterRows[0];
        const isAdmin = requester?.role?.includes('admin') || requester?.role?.includes('ceo');
        if (!isAdmin) return res.status(403).json({ success: false, error: 'Access Denied: Insufficient clearance to modify role.' });

        const updatedRows = await db.update(users).set({ role }).where(eq(users.id, Number(id))).returning();
        const updatedUser = updatedRows[0];
        if (!updatedUser) return res.status(404).json({ success: false, error: 'User not found' });
        notifyRefresh();
        res.json({ success: true, data: updatedUser });
    } catch (error: any) {
        console.error("Error in PUT /api/users/:id/role:", error);
        res.status(500).json({ success: false, error: 'Role update failure', details: error.message });
    }
});

app.put('/api/users/:id/profile', async (req, res) => {
    const { id } = req.params;
    const { fullname, username, email, bio, birthday, gamesPlayed, achievements: userAchievements, avatar, ign, requesterId } = req.body;

    if (!requesterId) return res.status(400).json({ success: false, error: 'Missing requesterId' });

    try {
        // SECURITY: Only the user themselves or an admin can update a profile
        const requesterRows = await db.select().from(users).where(eq(users.id, Number(requesterId)));
        const requester = requesterRows[0];
        const isAdmin = requester?.role?.includes('admin') || requester?.role?.includes('ceo');
        if (!isAdmin && Number(requesterId) !== Number(id)) {
            return res.status(403).json({ success: false, error: 'Access Denied: You cannot edit another operative\'s profile.' });
        }

        const updateSet: any = {
            bio,
            birthday,
            avatar,
            ign,
            gamesPlayed: gamesPlayed ? JSON.stringify(gamesPlayed) : undefined,
            achievements: userAchievements ? JSON.stringify(userAchievements) : undefined
        };

        if (fullname) updateSet.fullname = fullname;
        if (username) updateSet.username = username;
        if (email) updateSet.email = email.toLowerCase();

        const updatedUserRows = await db.update(users)
            .set(updateSet)
            .where(eq(users.id, Number(id)))
            .returning();
        const updatedUser = updatedUserRows[0];

        if (!updatedUser) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        // Remove password hash from response
        const { password: _pw, ...safeUpdatedUser } = updatedUser as any;
        notifyRefresh();
        res.json({ success: true, data: safeUpdatedUser });
    } catch (error: any) {
        console.error("Error in PUT /api/users/:id/profile:", error);
        res.status(500).json({ success: false, error: 'Internal Server Error', details: IS_PROD ? undefined : error.message });
    }
});

app.post('/api/auth/change-password', async (req, res) => {
    const { userId, oldPassword, newPassword } = req.body;
    if (!userId || !oldPassword || !newPassword) return res.status(400).json({ error: 'Missing fields' });

    try {
        const uId = Number(userId);
        const userRows = await db.select().from(users).where(eq(users.id, uId));
        const user = userRows[0];
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        const isMatch = await verifyPassword(oldPassword, user.password, uId);
        if (!isMatch) return res.status(401).json({ success: false, error: 'Incorrect old password' });

        const hashedPassword = await hashPassword(newPassword);
        await db.update(users).set({ password: hashedPassword }).where(eq(users.id, uId));
        notifyRefresh();
        res.json({ success: true, message: 'Identity credentials reset successful.' });
    } catch (error: any) {
        console.error("Error in POST /api/auth/change-password:", error);
        res.status(500).json({ success: false, error: 'Failed to change password', details: IS_PROD ? undefined : error.message });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const userId = Number(id);
    const { requesterId } = req.body;
    if (!requesterId) return res.status(400).json({ success: false, error: 'Missing requesterId' });
    try {
        // Auth guard: must be the same user or an admin
        const requesterRows = await db.select().from(users).where(eq(users.id, Number(requesterId)));
        const requester = requesterRows[0];
        const isAdmin = requester?.role?.includes('admin') || requester?.role?.includes('ceo');
        if (!isAdmin && Number(requesterId) !== userId) {
            return res.status(403).json({ success: false, error: 'Access Denied: You cannot delete other accounts.' });
        }

        // Step 1: find their player record (if any)
        const playerRows = await db.select().from(players).where(eq(players.userId, userId));
        const playerRow = playerRows[0];

        if (playerRow) {
            // Step 2: delete quota progress for this player
            await db.delete(playerQuotaProgress).where(eq(playerQuotaProgress.playerId, playerRow.id));
            // Step 3: delete scrim player stats
            await db.delete(scrimPlayerStats).where(eq(scrimPlayerStats.playerId, playerRow.id));
            // Step 4: delete tournament player stats
            await db.delete(tournamentPlayerStats).where(eq(tournamentPlayerStats.playerId, playerRow.id));
            // Step 5: delete the player record itself
            await db.delete(players).where(eq(players.id, playerRow.id));
        }

        // Step 6: delete the user
        await db.delete(users).where(eq(users.id, userId));
        notifyRefresh();
        res.json({ success: true, message: 'Account deleted successfully' });
    } catch (error: any) {
        console.error("Error in DELETE /api/users/:id:", error);
        res.status(500).json({ success: false, error: 'Failed to delete account', details: IS_PROD ? undefined : error.message });
    }
});

// Notifications
app.get('/api/notifications', async (req, res) => {
    const { userId, requesterId } = req.query;
    if (!userId || !requesterId) return res.status(400).json({ success: false, error: 'Missing userId or requesterId' });

    // Security check: Only the user themselves (or an admin) should see their notifications
    if (Number(userId) !== Number(requesterId)) {
        return res.status(403).json({ success: false, error: 'Access Denied: You cannot view transmissions for this unit.' });
    }

    try {
        const data = await db.select()
            .from(notifications)
            .where(eq(notifications.userId, Number(userId)))
            .orderBy(desc(notifications.createdAt))
            .limit(20);
        res.json({ success: true, data });
    } catch (error: any) {
        console.error("Error in GET /api/notifications:", error);
        res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
    }
});

app.patch('/api/notifications/:id/read', async (req, res) => {
    const { id } = req.params;
    const { requesterId } = req.body;

    if (!requesterId) return res.status(400).json({ success: false, error: 'Missing requesterId' });

    try {
        // Security check: verify ownership
        const notifRows = await db.select().from(notifications).where(eq(notifications.id, Number(id)));
        const notif = notifRows[0];
        if (!notif) return res.status(404).json({ success: false, error: 'Notification not found' });

        if (notif.userId !== Number(requesterId)) {
            return res.status(403).json({ success: false, error: 'Access Denied: Interference with unauthorized transmissions detected.' });
        }

        await db.update(notifications)
            .set({ isRead: true })
            .where(eq(notifications.id, Number(id)));
        res.json({ success: true });
    } catch (error: any) {
        console.error("Error in PATCH /api/notifications/:id/read:", error);
        res.status(500).json({ success: false, error: 'Failed to update notification' });
    }
});

// --- DYNAMIC CONTENT ROUTES ---

// CRON Trigger for Vercel
app.get('/api/cron/check-notifications', async (req, res) => {
    // Basic security: check for a secret header or key if desired, 
    // but Vercel Cron can also be restricted by IP or just rely on obscurity/low-impact.
    console.log('[CRON] Triggered notification check via API...');
    try {
        if (!checkAllNotifications) {
            const scheduler = await import('./scheduler.js');
            checkAllNotifications = scheduler.checkAllNotifications;
        }
        await checkAllNotifications();
        res.json({ success: true, message: 'Notification check completed.' });
    } catch (error: any) {
        console.error('[CRON ERROR] Notification check failed:', error);
        res.status(500).json({ success: false, error: 'Cron check failed', details: error.message });
    }
});

// achievements
app.get('/api/achievements', async (req, res) => {
    try {
        const data = await db.select().from(achievements);
        res.json({ success: true, data });
    } catch (error: any) {
        console.error("Error in GET /api/achievements:", error);
        res.status(500).json({ success: false, error: 'Failed to fetch achievements', details: IS_PROD ? undefined : error.message });
    }
});

app.post('/api/achievements', async (req, res) => {
    const { title, date, description, placement, image, game, requesterId } = req.body;
    if (!title || !date || !description) return res.status(400).json({ success: false, error: 'Missing required fields' });
    if (!requesterId) return res.status(400).json({ success: false, error: 'Missing requesterId' });
    try {
        // SECURITY: Only admins/CEO can create achievements
        const requesterRows = await db.select().from(users).where(eq(users.id, Number(requesterId)));
        const requester = requesterRows[0];
        const isAdmin = requester?.role?.includes('admin') || requester?.role?.includes('ceo');
        if (!isAdmin) return res.status(403).json({ success: false, error: 'Access Denied: Insufficient clearance to add achievements.' });

        const newAchievementRows = await db.insert(achievements).values({
            title, date, description, placement: placement || 'Finalist', image, game
        }).returning();
        const newAchievement = newAchievementRows[0];
        notifyRefresh();
        res.json({ success: true, data: newAchievement });
    } catch (e: any) {
        console.error("Error creating achievement:", e);
        res.status(500).json({ success: false, error: 'Failed to add achievement', details: IS_PROD ? undefined : e.message });
    }
});

// events
app.get('/api/events', async (req, res) => {
    try {
        const data = await db.select().from(events);
        res.json({ success: true, data });
    } catch (error: any) {
        console.error("Error in GET /api/events:", error);
        res.status(500).json({ success: false, error: 'Failed to fetch events', details: IS_PROD ? undefined : error.message });
    }
});

app.post('/api/events', async (req, res) => {
    const { title, date, location, description, image, requesterId } = req.body;
    if (!title || !date || !description) return res.status(400).json({ success: false, error: 'Missing required fields' });
    if (!requesterId) return res.status(400).json({ success: false, error: 'Missing requesterId' });
    try {
        // SECURITY: Only admins/CEO can create events
        const requesterRows = await db.select().from(users).where(eq(users.id, Number(requesterId)));
        const requester = requesterRows[0];
        const isAdmin = requester?.role?.includes('admin') || requester?.role?.includes('ceo');
        if (!isAdmin) return res.status(403).json({ success: false, error: 'Access Denied: Insufficient clearance to create events.' });

        const newEventRows = await db.insert(events).values({
            title, date, location, description, status: 'upcoming', image
        }).returning();
        const newEvent = newEventRows[0];
        notifyRefresh();

        // Immediate Discord Announcement
        try {
            const { sendAIEventNotification } = await import('./scheduler.js');
            await sendAIEventNotification(newEvent, 'NEW');
        } catch (err) {
            console.error('[DISCORD ERROR] Failed to send immediate event notification:', err);
        }

        res.json({ success: true, data: newEvent });
    } catch (e: any) {
        console.error("Error creating event:", e);
        res.status(500).json({ success: false, error: 'Failed to create event', details: IS_PROD ? undefined : e.message });
    }
});


app.get('/api/scrims/:id/stats', async (req, res) => {
    const scrimId = Number(req.params.id);
    const requesterId = req.query.requesterId ? Number(req.query.requesterId) : undefined;

    try {
        let requester = null;
        if (requesterId) {
            const requesterRows = await db.select().from(users).where(eq(users.id, Number(requesterId)));
            requester = requesterRows[0];
        }
        const isAdmin = requester?.role?.includes('admin') || requester?.role?.includes('ceo');

        const scrimDataRows = await db.select().from(scrims).where(eq(scrims.id, scrimId));
        const scrimData = scrimDataRows[0];
        if (!scrimData) return res.status(404).json({ success: false, error: 'Scrim not found' });

        // Authorization check if not admin
        if (!isAdmin && requesterId) {
            const teamRows = await db.select().from(teams).where(eq(teams.id, scrimData.teamId!));
            const isMember = await db.select().from(players).where(and(eq(players.teamId, scrimData.teamId!), eq(players.userId, requesterId)));
            if (teamRows[0]?.managerId !== requesterId && isMember.length === 0) {
                return res.status(403).json({ success: false, error: 'Access Denied' });
            }
        }

        const stats = await db.select({
            id: scrimPlayerStats.id,
            scrimId: scrimPlayerStats.scrimId,
            playerId: scrimPlayerStats.playerId,
            kills: scrimPlayerStats.kills,
            deaths: scrimPlayerStats.deaths,
            assists: scrimPlayerStats.assists,
            acs: scrimPlayerStats.acs,
            isWin: scrimPlayerStats.isWin,
            agent: scrimPlayerStats.agent,
            role: scrimPlayerStats.role,
            map: scrimPlayerStats.map,
            playerName: players.name,
            playerImage: players.image,
            playerRole: players.role,
            playerUserId: players.userId
        })
            .from(scrimPlayerStats)
            .leftJoin(players, eq(scrimPlayerStats.playerId, players.id))
            .where(eq(scrimPlayerStats.scrimId, scrimId));

        // Filter out stats for coaches/managers just in case
        const filteredStats = stats.filter(s => !s.playerRole?.toLowerCase().includes('coach'));

        res.json({ success: true, data: { scrim: scrimData, stats: filteredStats } });
    } catch (error: any) {
        console.error("Error fetching scrim stats:", error);
        res.status(500).json({ success: false, error: 'Failed to fetch stats', details: error.message });
    }
});

app.get('/api/tournaments/:id/stats', async (req, res) => {
    const tournamentId = Number(req.params.id);
    try {
        const tournamentDataRows = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
        const tournamentData = tournamentDataRows[0];
        if (!tournamentData) return res.status(404).json({ success: false, error: 'Tournament not found' });

        const stats = await db.select({
            id: tournamentPlayerStats.id,
            tournamentId: tournamentPlayerStats.tournamentId,
            playerId: tournamentPlayerStats.playerId,
            kills: tournamentPlayerStats.kills,
            deaths: tournamentPlayerStats.deaths,
            assists: tournamentPlayerStats.assists,
            acs: tournamentPlayerStats.acs,
            isWin: tournamentPlayerStats.isWin,
            agent: tournamentPlayerStats.agent,
            role: tournamentPlayerStats.role,
            map: tournamentPlayerStats.map,
            playerName: players.name,
            playerImage: players.image,
            playerRole: players.role,
            playerUserId: players.userId
        })
            .from(tournamentPlayerStats)
            .leftJoin(players, eq(tournamentPlayerStats.playerId, players.id))
            .where(eq(tournamentPlayerStats.tournamentId, tournamentId));

        const filteredStats = stats.filter(s => !s.playerRole?.toLowerCase().includes('coach'));
        res.json({ success: true, data: { scrim: tournamentData, stats: filteredStats } });
    } catch (error: any) {
        console.error("Error fetching tournament stats:", error);
        res.status(500).json({ success: false, error: 'Failed to fetch tournament stats', details: error.message });
    }
});


// Shared Robust Win/Loss Parser for Stats
function parseIsWin(score: any, isVictory?: boolean): number {
    if (isVictory === true) return 1;
    if (isVictory === false) return 0;

    const s = typeof score === 'string' ? score.toUpperCase().trim() : '';
    if (s === 'WIN') return 1;
    if (s === 'LOSS') return 0;

    if (s.includes('-')) {
        const [s1, s2] = s.split('-').map(str => parseInt(str.trim()));
        if (!isNaN(s1) && !isNaN(s2)) {
            if (s1 > s2) return 1;
            if (s1 < s2) return 0;
            return 2; // DRAW
        }
    }

    return 2;
}

app.get('/api/teams/:id/stats', async (req, res) => {
    const teamId = Number(req.params.id);
    const { requesterId } = req.query;
    const cacheKey = `team-stats:${teamId}:${requesterId ?? 'guest'}`;

    try {
        const cached = getCache(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        // Fetch scrims + tournaments in parallel (was sequential before)
        const [teamScrims, teamTourneys] = await Promise.all([
            db.select().from(scrims).where(eq(scrims.teamId, teamId)),
            db.select().from(tournaments).where(eq(tournaments.teamId, teamId)),
        ]);
        const completedScrims = teamScrims.filter(s => s.status === 'completed');
        const scrimIds = completedScrims.map(s => s.id);
        const completedTourneys = teamTourneys.filter(t => t.status === 'completed');
        const tourneyIds = completedTourneys.map(t => t.id);


        let scrimWins = 0;
        let scrimLosses = 0;
        let scrimDraws = 0;
        const scrimRecentForm: string[] = [];
        const scrimMapStats: Record<string, { played: number, wins: number, losses: number, draws: number }> = {};
        const scrimAgentStats: Record<string, { wins: number, draws: number, total: number, maps: Record<string, number>, history: any[] }> = {};
        const scrimPlayerAgentAgg: Record<string, Record<number, any>> = {};
        let scrimTopPlayers: any[] = [];

        if (scrimIds.length > 0) {
            completedScrims.forEach(s => {
                if (s.results) {
                    try {
                        const results = JSON.parse(s.results);
                        let matchWins = 0;
                        let matchLosses = 0;
                        results.forEach((r: any) => {
                            const mapName = r.mapName || `Map ${r.map}`;
                            if (!scrimMapStats[mapName]) scrimMapStats[mapName] = { played: 0, wins: 0, losses: 0, draws: 0 };
                            scrimMapStats[mapName].played++;
                            const isVictory = parseIsWin(r.score, r.isVictory) === 1;
                            const isLoss = parseIsWin(r.score, r.isVictory) === 0;

                            if (isVictory) {
                                matchWins++;
                                scrimMapStats[mapName].wins++;
                            } else if (isLoss) {
                                matchLosses++;
                                scrimMapStats[mapName].losses++;
                            } else {
                                scrimMapStats[mapName].draws++;
                            }
                        });
                        if (results.length > 0) {
                            if (matchWins > matchLosses) { scrimWins++; scrimRecentForm.push('W'); }
                            else if (matchWins < matchLosses) { scrimLosses++; scrimRecentForm.push('L'); }
                            else { scrimDraws++; scrimRecentForm.push('D'); }
                        }
                    } catch (e) { }
                }
            });

            const scrimAllStats = await db.select({
                ...scrimPlayerStats,
                playerName: players.name,
                playerUserId: players.userId,
                playerTeamId: players.teamId
            })
                .from(scrimPlayerStats)
                .leftJoin(players, eq(scrimPlayerStats.playerId, players.id))
                .where(inArray(scrimPlayerStats.scrimId, scrimIds));

            const scrimPlayerAgg: Record<number, any> = {};
            scrimAllStats.forEach(stat => {
                if (!stat.playerId) return;

                // Track agent stats for team
                if (stat.agent) {
                    if (!scrimAgentStats[stat.agent]) scrimAgentStats[stat.agent] = { wins: 0, draws: 0, total: 0, maps: {}, history: [] } as any;
                    scrimAgentStats[stat.agent].total++;
                    if (stat.isWin === 1) {
                        scrimAgentStats[stat.agent].wins++;
                    } else if (stat.isWin === 2) {
                        scrimAgentStats[stat.agent].draws++;
                    }

                    // Track maps for this agent
                    const mapName = stat.map || 'Unknown';
                    const sAg = scrimAgentStats[stat.agent] as any;
                    sAg.maps[mapName] = (sAg.maps[mapName] || 0) + 1;

                    // Track history for this agent
                    const associatedScrim = completedScrims.find(sc => sc.id === stat.scrimId);
                    if (associatedScrim) {
                        sAg.history.push({
                            date: associatedScrim.date,
                            opponent: associatedScrim.opponent,
                            score: stat.isWin === 1 ? 'WIN' : stat.isWin === 2 ? 'DRAW' : 'LOSS', // We'll keep it simple for history
                            map: stat.map,
                            isWin: stat.isWin === 1
                        });
                    }

                    // Per-player per-agent aggregation
                    if (!scrimPlayerAgentAgg[stat.agent]) scrimPlayerAgentAgg[stat.agent] = {};
                    if (!scrimPlayerAgentAgg[stat.agent][stat.playerId!]) {
                        scrimPlayerAgentAgg[stat.agent][stat.playerId!] = { playerId: stat.playerId, name: stat.playerName || 'Unknown', kills: 0, deaths: 0, assists: 0, acs: 0, wins: 0, total: 0 };
                    }
                    const paa = scrimPlayerAgentAgg[stat.agent][stat.playerId!];
                    paa.kills += stat.kills || 0;
                    paa.deaths += stat.deaths || 0;
                    paa.assists += stat.assists || 0;
                    paa.acs += stat.acs || 0;
                    paa.total++;
                    if (stat.isWin === 1) paa.wins++;
                }

                if (!scrimPlayerAgg[stat.playerId]) {
                    scrimPlayerAgg[stat.playerId] = { id: stat.playerId, userId: stat.playerUserId, teamId: (stat as any).playerTeamId, name: stat.playerName || 'Unknown', kills: 0, deaths: 0, assists: 0, acs: 0, games: 0 };
                }
                scrimPlayerAgg[stat.playerId].kills += stat.kills || 0;
                scrimPlayerAgg[stat.playerId].deaths += stat.deaths || 0;
                scrimPlayerAgg[stat.playerId].assists += stat.assists || 0;
                scrimPlayerAgg[stat.playerId].acs += stat.acs || 0;
                scrimPlayerAgg[stat.playerId].games++;
            });

            scrimTopPlayers = Object.values(scrimPlayerAgg).map(p => ({
                id: p.id,
                name: p.name,
                userId: p.userId,
                teamId: p.teamId,
                kd: p.deaths > 0 ? (p.kills / p.deaths).toFixed(2) : p.kills,
                avgKills: Number((p.kills / p.games).toFixed(1)),
                avgDeaths: Number((p.deaths / p.games).toFixed(1)),
                avgAcs: Math.round(p.acs / p.games),
                games: p.games
            })).sort((a, b) => Number(b.kd) - Number(a.kd));
        }

        // --- 2. TOURNAMENT STATS ---
        // (teamTourneys, completedTourneys, tourneyIds already fetched above in Promise.all)

        let tourneyWins = 0;
        let tourneyLosses = 0;
        let tourneyDraws = 0;
        const tourneyRecentForm: string[] = [];
        const tourneyAgentStats: Record<string, { wins: number, draws: number, total: number, maps: Record<string, number>, history: any[] }> = {};
        const tourneyPlayerAgentAgg: Record<string, Record<number, any>> = {};
        let tourneyTopPlayers: any[] = [];

        if (tourneyIds.length > 0) {
            completedTourneys.forEach(t => {
                if (t.results) {
                    try {
                        const results = JSON.parse(t.results);
                        let matchWins = 0, matchLosses = 0;
                        results.forEach((r: any) => {
                            const isVictory = parseIsWin(r.score, r.isVictory) === 1;
                            const isLoss = parseIsWin(r.score, r.isVictory) === 0;

                            if (isVictory) matchWins++;
                            else if (isLoss) matchLosses++;
                        });
                        if (results.length > 0) {
                            if (matchWins > matchLosses) { tourneyWins++; tourneyRecentForm.push('W'); }
                            else if (matchWins < matchLosses) { tourneyLosses++; tourneyRecentForm.push('L'); }
                            else { tourneyDraws++; tourneyRecentForm.push('D'); }
                        }
                    } catch (e) { }
                }
            });

            const tourneyAllStats = await db.select({
                ...tournamentPlayerStats,
                playerName: players.name,
                playerUserId: players.userId,
                playerTeamId: players.teamId
            })
                .from(tournamentPlayerStats)
                .leftJoin(players, eq(tournamentPlayerStats.playerId, players.id))
                .where(inArray(tournamentPlayerStats.tournamentId, tourneyIds));

            const tourneyPlayerAgg: Record<number, any> = {};
            tourneyAllStats.forEach(stat => {
                if (!stat.playerId) return;

                // Track agent stats for team
                if (stat.agent) {
                    if (!tourneyAgentStats[stat.agent]) tourneyAgentStats[stat.agent] = { wins: 0, draws: 0, total: 0, maps: {}, history: [] } as any;
                    tourneyAgentStats[stat.agent].total++;
                    if (stat.isWin === 1) {
                        tourneyAgentStats[stat.agent].wins++;
                    } else if (stat.isWin === 2) {
                        tourneyAgentStats[stat.agent].draws++;
                    }

                    // Track maps for this agent
                    const mapName = stat.map || 'Unknown';
                    const tAg = tourneyAgentStats[stat.agent] as any;
                    tAg.maps[mapName] = (tAg.maps[mapName] || 0) + 1;

                    // Track history for this agent
                    const associatedTourney = completedTourneys.find(tr => tr.id === stat.tournamentId);
                    if (associatedTourney) {
                        tAg.history.push({
                            date: associatedTourney.date,
                            opponent: associatedTourney.opponent,
                            score: stat.isWin === 1 ? 'WIN' : stat.isWin === 2 ? 'DRAW' : 'LOSS',
                            map: stat.map,
                            isWin: stat.isWin === 1
                        });
                    }

                    // Per-player per-agent aggregation
                    if (!tourneyPlayerAgentAgg[stat.agent]) tourneyPlayerAgentAgg[stat.agent] = {};
                    if (!tourneyPlayerAgentAgg[stat.agent][stat.playerId!]) {
                        tourneyPlayerAgentAgg[stat.agent][stat.playerId!] = { playerId: stat.playerId, name: stat.playerName || 'Unknown', kills: 0, deaths: 0, assists: 0, acs: 0, wins: 0, total: 0 };
                    }
                    const paa = tourneyPlayerAgentAgg[stat.agent][stat.playerId!];
                    paa.kills += stat.kills || 0;
                    paa.deaths += stat.deaths || 0;
                    paa.assists += stat.assists || 0;
                    paa.acs += stat.acs || 0;
                    paa.total++;
                    if (stat.isWin === 1) paa.wins++;
                }

                if (!tourneyPlayerAgg[stat.playerId]) {
                    tourneyPlayerAgg[stat.playerId] = { id: stat.playerId, userId: stat.playerUserId, teamId: (stat as any).playerTeamId, name: stat.playerName || 'Unknown', kills: 0, deaths: 0, assists: 0, acs: 0, games: 0 };
                }
                tourneyPlayerAgg[stat.playerId].kills += stat.kills || 0;
                tourneyPlayerAgg[stat.playerId].deaths += stat.deaths || 0;
                tourneyPlayerAgg[stat.playerId].assists += stat.assists || 0;
                tourneyPlayerAgg[stat.playerId].acs += stat.acs || 0;
                tourneyPlayerAgg[stat.playerId].games++;
            });

            tourneyTopPlayers = Object.values(tourneyPlayerAgg).map(p => ({
                id: p.id,
                name: p.name,
                userId: p.userId,
                teamId: p.teamId,
                kd: p.deaths > 0 ? (p.kills / p.deaths).toFixed(2) : p.kills,
                avgKills: Number((p.kills / p.games).toFixed(1)),
                avgDeaths: Number((p.deaths / p.games).toFixed(1)),
                avgAcs: Math.round(p.acs / p.games),
                games: p.games
            })).sort((a, b) => Number(b.kd) - Number(a.kd));
        }

        const statsData = {
            scrim: {
                gamesPlayed: scrimWins + scrimLosses + scrimDraws,
                winRate: (scrimWins + scrimLosses + scrimDraws) > 0 ? Math.round((scrimWins / (scrimWins + scrimLosses + scrimDraws)) * 100) : 0,
                wins: scrimWins,
                losses: scrimLosses,
                draws: scrimDraws,
                recentForm: scrimRecentForm.slice(-5),
                mapStats: scrimMapStats,
                agentStats: scrimAgentStats,
                playerAgentStats: Object.fromEntries(
                    Object.entries(scrimPlayerAgentAgg).map(([agent, players]) => [
                        agent,
                        Object.values(players).map((p: any) => ({
                            name: p.name,
                            teamId: p.teamId,
                            kda: p.deaths > 0 ? ((p.kills + p.assists * 0.5) / p.deaths).toFixed(2) : (p.kills + p.assists * 0.5).toFixed(2),
                            avgAcs: p.total > 0 ? Math.round(p.acs / p.total) : 0,
                            wins: p.wins,
                            total: p.total,
                            winRate: p.total > 0 ? Math.round((p.wins / p.total) * 100) : 0
                        })).sort((a: any, b: any) => Number(b.kda) - Number(a.kda))
                    ])
                ),
                topPlayers: scrimTopPlayers
            },
            tournament: {
                gamesPlayed: tourneyWins + tourneyLosses + tourneyDraws,
                winRate: (tourneyWins + tourneyLosses + tourneyDraws) > 0 ? Math.round((tourneyWins / (tourneyWins + tourneyLosses + tourneyDraws)) * 100) : 0,
                wins: tourneyWins,
                losses: tourneyLosses,
                draws: tourneyDraws,
                recentForm: tourneyRecentForm.slice(-5),
                agentStats: tourneyAgentStats,
                playerAgentStats: Object.fromEntries(
                    Object.entries(tourneyPlayerAgentAgg).map(([agent, players]) => [
                        agent,
                        Object.values(players).map((p: any) => ({
                            name: p.name,
                            teamId: p.teamId,
                            avgKills: p.total > 0 ? Number((p.kills / p.total).toFixed(1)) : 0,
                            avgDeaths: p.total > 0 ? Number((p.deaths / p.total).toFixed(1)) : 0,
                            kda: p.deaths > 0 ? ((p.kills + p.assists * 0.5) / p.deaths).toFixed(2) : (p.kills + p.assists * 0.5).toFixed(2),
                            avgAcs: p.total > 0 ? Math.round(p.acs / p.total) : 0,
                            wins: p.wins,
                            total: p.total,
                            winRate: p.total > 0 ? Math.round((p.wins / p.total) * 100) : 0
                        })).sort((a: any, b: any) => Number(b.kda) - Number(a.kda))
                    ])
                ),
                topPlayers: tourneyTopPlayers
            },
            topPlayers: scrimTopPlayers.slice(0, 5)
        };

        setCache(cacheKey, statsData);
        res.json({ success: true, data: statsData });

    } catch (error: any) {
        console.error("Error fetching team stats:", error);
        res.status(500).json({ success: false, error: 'Failed to fetch team stats', details: IS_PROD ? undefined : error.message });
    }
});

app.get('/api/players/:id/breakdown', async (req, res) => {
    const playerId = Number(req.params.id);
    try {
        // 1. Fetch Player and all their historical player records (across different teams)
        const playerRecord = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
        if (playerRecord.length === 0) return res.status(404).json({ success: false, error: 'Player not found' });

        const targetUserId = playerRecord[0].userId;
        let allPlayerIds = [playerId];

        if (targetUserId) {
            const relatedPlayers = await db.select({ id: players.id }).from(players).where(eq(players.userId, targetUserId));
            allPlayerIds = relatedPlayers.map(p => p.id);
        }

        const [scrimStats, tourneyStats] = await Promise.all([
            db.select({
                id: scrimPlayerStats.id,
                scrimId: scrimPlayerStats.scrimId,
                kills: scrimPlayerStats.kills,
                deaths: scrimPlayerStats.deaths,
                assists: scrimPlayerStats.assists,
                acs: scrimPlayerStats.acs,
                isWin: scrimPlayerStats.isWin,
                agent: scrimPlayerStats.agent,
                role: scrimPlayerStats.role,
                map: scrimPlayerStats.map,
                date: scrims.date,
                opponent: scrims.opponent
            })
                .from(scrimPlayerStats)
                .leftJoin(scrims, eq(scrimPlayerStats.scrimId, scrims.id))
                .where(inArray(scrimPlayerStats.playerId, allPlayerIds)),

            db.select({
                id: tournamentPlayerStats.id,
                tournamentId: tournamentPlayerStats.tournamentId,
                kills: tournamentPlayerStats.kills,
                deaths: tournamentPlayerStats.deaths,
                assists: tournamentPlayerStats.assists,
                acs: tournamentPlayerStats.acs,
                isWin: tournamentPlayerStats.isWin,
                agent: tournamentPlayerStats.agent,
                role: tournamentPlayerStats.role,
                map: tournamentPlayerStats.map,
                date: tournaments.date,
                opponent: tournaments.opponent
            })
                .from(tournamentPlayerStats)
                .leftJoin(tournaments, eq(tournamentPlayerStats.tournamentId, tournaments.id))
                .where(inArray(tournamentPlayerStats.playerId, allPlayerIds))
        ]);

        const allStats = [...scrimStats, ...tourneyStats].sort((a, b) =>
            new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
        );

        // 2. Aggregate Overall
        let totalK = 0, totalD = 0, totalA = 0, totalAcs = 0, wins = 0;
        const totalMatches = allStats.length;

        // 3. Aggregate Agents, Maps & Roles
        const agents: Record<string, any> = {};
        const maps: Record<string, any> = {};
        const roles: Record<string, any> = {};

        allStats.forEach(s => {
            totalK += s.kills || 0;
            totalD += s.deaths || 0;
            totalA += s.assists || 0;
            totalAcs += s.acs || 0;
            if (s.isWin === 1) wins++;

            if (s.agent) {
                if (!agents[s.agent]) agents[s.agent] = { name: s.agent, role: s.role || 'Unknown', kills: 0, deaths: 0, assists: 0, matches: 0, wins: 0 };
                agents[s.agent].kills += s.kills || 0;
                agents[s.agent].deaths += s.deaths || 0;
                agents[s.agent].assists += s.assists || 0;
                agents[s.agent].matches++;
                if (s.isWin === 1) agents[s.agent].wins++;
            }

            if (s.map) {
                if (!maps[s.map]) maps[s.map] = { name: s.map, kills: 0, deaths: 0, assists: 0, matches: 0, wins: 0 };
                maps[s.map].kills += s.kills || 0;
                maps[s.map].deaths += s.deaths || 0;
                maps[s.map].assists += s.assists || 0;
                maps[s.map].matches++;
                if (s.isWin === 1) maps[s.map].wins++;
            }

            if (s.role) {
                const roleName = s.role || 'Unknown';
                if (!roles[roleName]) roles[roleName] = { name: roleName, kills: 0, deaths: 0, assists: 0, matches: 0, wins: 0 };
                roles[roleName].kills += s.kills || 0;
                roles[roleName].deaths += s.deaths || 0;
                roles[roleName].assists += s.assists || 0;
                roles[roleName].matches++;
                if (s.isWin === 1) roles[roleName].wins++;
            }
        });

        const agentArray = Object.values(agents).map((a: any) => ({
            ...a,
            kda: a.deaths > 0 ? (a.kills + a.assists) / a.deaths : (a.kills + a.assists),
            winRate: a.matches > 0 ? Math.round((a.wins / a.matches) * 100) : 0
        })).sort((a, b) => b.matches - a.matches);

        const mapArray = Object.values(maps).map((m: any) => ({
            ...m,
            kda: m.deaths > 0 ? (m.kills + m.assists) / m.deaths : (m.kills + m.assists),
            winRate: m.matches > 0 ? Math.round((m.wins / m.matches) * 100) : 0
        })).sort((a, b) => b.matches - a.matches);

        const roleArray = Object.values(roles).map((r: any) => ({
            ...r,
            kda: r.deaths > 0 ? (r.kills + r.assists) / r.deaths : (r.kills + r.assists),
            winRate: r.matches > 0 ? Math.round((r.wins / r.matches) * 100) : 0
        })).sort((a, b) => b.matches - a.matches);

        res.json({
            success: true,
            data: {
                overall: {
                    totalMatches,
                    avgKills: totalMatches > 0 ? totalK / totalMatches : 0,
                    avgAssists: totalMatches > 0 ? totalA / totalMatches : 0,
                    avgKda: totalD > 0 ? (totalK + totalA) / totalD : (totalK + totalA),
                    avgAcs: totalMatches > 0 ? totalAcs / totalMatches : 0,
                    winRate: totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0
                },
                agents: agentArray,
                maps: mapArray,
                roles: roleArray,
                history: [
                    ...scrimStats.map(s => ({
                        matchId: s.scrimId,
                        type: 'scrim',
                        date: s.date,
                        opponent: s.opponent,
                        map: s.map,
                        agent: s.agent,
                        role: s.role,
                        kills: s.kills,
                        deaths: s.deaths,
                        assists: s.assists,
                        acs: s.acs,
                        isWin: s.isWin === 1
                    })),
                    ...tourneyStats.map(s => ({
                        matchId: s.tournamentId,
                        type: 'tournament',
                        date: s.date,
                        opponent: s.opponent,
                        map: s.map,
                        agent: s.agent,
                        role: s.role,
                        kills: s.kills,
                        deaths: s.deaths,
                        assists: s.assists,
                        acs: s.acs,
                        isWin: s.isWin === 1
                    }))
                ].sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
            }
        });
    } catch (error: any) {
        console.error("Error fetching player breakdown:", error);
        res.status(500).json({ success: false, error: 'Failed to fetch tactical breakdown', details: error.message });
    }
});

// sponsors
// ── Sponsor QR Management ───────────────────────────────────────────────────
app.put('/api/sponsors/:id/qr', async (req, res) => {
    const { id } = req.params;
    const { qrEWallet, qrBank, requesterId } = req.body;
    try {
        if (!requesterId) return res.status(401).json({ success: false, error: 'Unauthorized: Requester ID required.' });

        const requester = await db.select().from(users).where(eq(users.id, Number(requesterId)));
        const role = requester[0]?.role || '';
        const isAuth = role.includes('admin') || role.includes('ceo');

        // If not admin/ceo, must be the linked sponsor
        if (!isAuth) {
            const sponsor = await db.select().from(sponsors).where(eq(sponsors.id, Number(id)));
            if (sponsor[0]?.userId !== Number(requesterId)) {
                return res.status(403).json({ success: false, error: 'Access Denied: You cannot modify this partner asset.' });
            }
        }

        const updated = await db.update(sponsors).set({ qrEWallet, qrBank }).where(eq(sponsors.id, Number(id))).returning();
        notifyRefresh();
        res.json({ success: true, data: updated[0] });
    } catch (error: any) {
        res.status(500).json({ success: false, error: 'Failed to update Sponsor QR' });
    }
});

// ── Site Settings (Waks Corp QR) ──────────────────────────────────────────────
app.get('/api/site-settings', async (req, res) => {
    try {
        let settings = await db.select().from(siteSettings);
        if (settings.length === 0) {
            // Initialize if missing
            const init = await db.insert(siteSettings).values({ waksQrEWallet: null, waksQrBank: null }).returning();
            settings = init;
        }
        res.json({ success: true, data: settings[0] });
    } catch (error: any) {
        res.status(500).json({ success: false, error: 'Failed to fetch site settings' });
    }
});

app.put('/api/site-settings', async (req, res) => {
    const { waksQrEWallet, waksQrBank, requesterId } = req.body;
    try {
        if (!requesterId) return res.status(401).json({ success: false, error: 'Unauthorized: Requester ID required.' });

        const requester = await db.select().from(users).where(eq(users.id, Number(requesterId)));
        const role = requester[0]?.role || '';
        if (!role.includes('admin') && !role.includes('ceo')) {
            return res.status(403).json({ success: false, error: 'Access Denied: Only executive command can modify site-wide settings.' });
        }

        const settings = await db.select().from(siteSettings);
        let result;
        if (settings.length === 0) {
            result = await db.insert(siteSettings).values({ waksQrEWallet, waksQrBank }).returning();
        } else {
            result = await db.update(siteSettings).set({ waksQrEWallet, waksQrBank }).returning();
        }
        notifyRefresh();
        res.json({ success: true, data: result[0] });
    } catch (error: any) {
        res.status(500).json({ success: false, error: 'Failed to update site settings' });
    }
});
app.get('/api/sponsors', async (req, res) => {
    try {
        // Fetch all sponsors
        const data = await db.select().from(sponsors);

        // Also fetch users to check roles
        const allUsers = await db.select().from(users);

        // Filter sponsors: they must have a userId AND that user must have 'sponsor' in their role
        const filteredSponsors = data.filter(sponsor => {
            if (!sponsor.userId) return false;
            const u = allUsers.find(user => user.id === sponsor.userId);
            return u && u.role && u.role.includes('sponsor');
        });

        res.json({ success: true, data: filteredSponsors });
    } catch (error: any) {
        console.error("Error in GET /api/sponsors:", error);
        res.status(500).json({ success: false, error: 'Failed to fetch sponsors', details: IS_PROD ? undefined : error.message });
    }
});

app.post('/api/sponsors', async (req, res) => {
    const { name, tier, logo, description, website, userId } = req.body;
    if (!name || !tier || !logo) return res.status(400).json({ success: false, error: 'Missing required fields' });
    try {
        const newSponsorRows = await db.insert(sponsors).values({
            name, tier, logo, description, website, userId: userId ? Number(userId) : null
        }).returning();
        const newSponsor = newSponsorRows[0];

        // Ensure user gets the secondary role 'sponsor'
        if (userId) {
            const userRecord = await db.select().from(users).where(eq(users.id, Number(userId)));
            if (userRecord[0]) {
                const currentRole = userRecord[0].role || 'member';
                if (!currentRole.includes('sponsor')) {
                    const newRole = `${currentRole},sponsor`;
                    await db.update(users).set({ role: newRole }).where(eq(users.id, Number(userId)));
                }
            }
        }

        notifyRefresh();
        res.json({ success: true, data: newSponsor });
    } catch (error: any) {
        console.error("Error in POST /api/sponsors:", error);
        res.status(500).json({ success: false, error: 'Failed to add sponsor', details: IS_PROD ? undefined : error.message });
    }
});

app.put('/api/sponsors/:id', async (req, res) => {
    const { id } = req.params;
    const { tier } = req.body;
    console.log(`[DEBUG] PUT /api/sponsors/${id} - Tier: ${tier}`);

    if (!tier) {
        console.error('[DEBUG] Missing tier in request body');
        return res.status(400).json({ success: false, error: 'Missing tier' });
    }

    try {
        console.log('[DEBUG] Executing DB update...');
        const updatedSponsorRows = await db.update(sponsors)
            .set({ tier })
            .where(eq(sponsors.id, Number(id)))
            .returning();
        const updatedSponsor = updatedSponsorRows[0];

        console.log('[DEBUG] Update result:', updatedSponsor);

        if (!updatedSponsor) {
            console.error(`[DEBUG] Sponsor with ID ${id} not found.`);
            return res.status(404).json({ success: false, error: 'Sponsor not found' });
        }
        notifyRefresh();
        res.json({ success: true, data: updatedSponsor });
        console.log('[DEBUG] Response sent successfully.');
    } catch (e: any) {
        console.error("[DEBUG] Error updating sponsor:", e);
        res.status(500).json({ success: false, error: 'Failed to update sponsor', details: IS_PROD ? undefined : e.message });
    }
});

app.delete('/api/sponsors/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.delete(sponsors).where(eq(sponsors.id, Number(id)));
        // For Postgres compatibility, result doesn't always have .changes directly on the result object in all drivers
        // SQLite: result.changes. Postgres: result is often an array or similar.
        // We'll trust the execution succeeded unless it throws.
        notifyRefresh();
        res.json({ success: true, message: 'Sponsor deleted successfully' });
        return;
    } catch (e: any) {
        console.error("Error deleting sponsor:", e);
        res.status(500).json({ success: false, error: 'Failed to delete sponsor', details: IS_PROD ? undefined : e.message });
    }
});

// Massive Seeding
app.post('/api/seed/massive', async (req, res) => {
    try {
        const games = ['Valorant', 'CS2', 'League of Legends', 'Dota 2', 'Overwatch 2'];
        const rolesPerGame: Record<string, string[]> = {
            'Valorant': ['Duelist', 'Sentinel', 'Initiator', 'Controller', 'IGL'],
            'CS2': ['Entry', 'AWP', 'Support', 'Lurker', 'IGL'],
            'League of Legends': ['Top', 'Jungle', 'Mid', 'ADC', 'Support'],
            'Dota 2': ['Carry', 'Mid', 'Offlane', 'Soft Support', 'Hard Support'],
            'Overwatch 2': ['Tank', 'Damage', 'Damage', 'Support', 'Support']
        };
        const mapsPerGame: Record<string, string[]> = {
            'Valorant': ['Ascent', 'Bind', 'Haven', 'Split'],
            'CS2': ['Mirage', 'Inferno', 'Dust2', 'Nuke'],
            'League of Legends': ['Summoners Rift'],
            'Dota 2': ['Dota Map'],
            'Overwatch 2': ['Eichenwalde', 'Hanamura', 'Kings Row']
        };

        const existingManagers = await db.select().from(users).where(eq(users.role, 'manager'));
        if (existingManagers.length === 0) return res.status(400).json({ success: false, error: 'Seed accounts first' });

        for (let i = 1; i <= 20; i++) {
            const game = games[i % games.length];
            const teamName = `WC ${game} Squad ${Math.floor(i / 5) + 1}-${i % 5}`;

            // 1. Create Team
            let teamRows = await db.select().from(teams).where(eq(teams.name, teamName));
            let team = teamRows[0];
            if (!team) {
                const newTeamRows = await db.insert(teams).values({
                    name: teamName,
                    game: game,
                    managerId: existingManagers[i % existingManagers.length].id,
                    description: `Professional ${game} Division`
                }).returning();
                team = newTeamRows[0];
            }

            // 2. Create Players (5 per team)
            const roles = rolesPerGame[game!];
            for (let j = 0; j < 5; j++) {
                const playerName = `${game}_Pro_${i}_${j}`;
                const username = playerName.toLowerCase();

                // Ensure User exists for this player
                const userRows = await db.select().from(users).where(eq(users.username, username));
                let user = userRows[0];
                if (!user) {
                    const newUserRows = await db.insert(users).values({
                        username,
                        password: hashPassword('password123'),
                        email: `${username}@waks.com`,
                        fullname: playerName.replace(/_/g, ' '),
                        role: 'member',
                        ign: playerName
                    }).returning();
                    user = newUserRows[0];
                }

                const existingPlayerRows = await db.select().from(players).where(eq(players.name, playerName));
                const existingPlayer = existingPlayerRows[0];
                if (!existingPlayer) {
                    await db.insert(players).values({
                        teamId: team.id,
                        userId: user.id,
                        name: playerName,
                        role: roles[j],
                        kda: (0.8 + Math.random() * 0.7).toFixed(2),
                        winRate: '50%',
                        acs: '200',
                        image: `https://ui-avatars.com/api/?name=${playerName}&background=random`
                    });
                } else if (!existingPlayer.userId) {
                    await db.update(players).set({ userId: user.id }).where(eq(players.id, existingPlayer.id));
                }
            }

            // 3. Create Scrim History (3 scrims per team)
            const teamPlayers = await db.select().from(players).where(eq(players.teamId, team.id));
            const maps = mapsPerGame[game!];
            for (let k = 1; k <= 3; k++) {
                const date = new Date();
                date.setDate(date.getDate() - k);
                const newScrimRows = await db.insert(scrims).values({
                    teamId: team.id,
                    date: date.toISOString(),
                    opponent: `Rival ${game} Team ${k}`,
                    format: 'BO1',
                    status: 'completed',
                    maps: JSON.stringify([maps[0]]),
                    results: JSON.stringify([{ map: 1, mapName: maps[0], score: k % 2 === 0 ? 'WIN' : 'LOSS' }])
                }).returning();
                const scrim = newScrimRows[0];

                // Add Player Stats
                for (const p of teamPlayers) {
                    await db.insert(scrimPlayerStats).values({
                        scrimId: scrim.id,
                        playerId: p.id,
                        kills: 15 + Math.floor(Math.random() * 15),
                        deaths: 10 + Math.floor(Math.random() * 15),
                        assists: 5 + Math.floor(Math.random() * 10),
                        acs: 150 + Math.floor(Math.random() * 200),
                        isWin: k % 2 === 0 ? 1 : 0
                    });
                }
            }
        }
        notifyRefresh();
        res.json({ success: true, message: 'Massive dataset seeded successfully' });
    } catch (e: any) {
        console.error("Error in massive seed:", e);
        res.status(500).json({ success: false, error: 'Massive seed failed', details: IS_PROD ? undefined : e.message });
    }
});

// teams & players
app.get('/api/teams', async (req, res) => {
    const requesterId = req.query.requesterId ? Number(req.query.requesterId) : (req.query.managerId ? Number(req.query.managerId) : undefined);
    const teamId = req.query.id ? Number(req.query.id) : undefined;

    try {
        // Cache check: return immediately if data is fresh (busted on any DB write)
        const cacheKey = `teams:${requesterId ?? 'all'}:${teamId ?? 'all'}`;
        const cached = getCache(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        let requester = null;
        if (requesterId) {
            const requesterRows = await db.select().from(users).where(eq(users.id, requesterId));
            requester = requesterRows[0];
        }


        const isAdmin = requester?.role?.includes('admin') || requester?.role?.includes('ceo');
        const isManager = requester?.role?.includes('manager') || requester?.role?.includes('coach');

        let query = db.select().from(teams);

        // Authorization & Filtering
        if (!isAdmin && requesterId) {
            // Non-admins only see teams they manage or play/coach in
            query = query.where(
                or(
                    eq(teams.managerId, requesterId),
                    sql`EXISTS (SELECT 1 FROM ${players} WHERE ${players.teamId} = ${teams.id} AND ${players.userId} = ${requesterId})`
                )
            ) as any;
        }

        if (teamId) {
            query = query.where(eq(teams.id, teamId)) as any;
        }

        const teamData = await query;
        if (teamData.length === 0) {
            return res.json({ success: true, data: [] });
        }

        const teamIds = teamData.map(t => t.id);

        // Optimized FETCH: Only get players and teams initially
        const allPlayers = await db.select({
            id: players.id,
            teamId: players.teamId,
            userId: players.userId,
            name: players.name,
            role: players.role,
            kda: players.kda,
            winRate: players.winRate,
            acs: players.acs,
            image: players.image,
            level: players.level,
            xp: players.xp,
            isActive: players.isActive
        }).from(players).where(inArray(players.teamId, teamIds));

        // Fetch users in parallel
        const playerUserIds = allPlayers.map(p => p.userId).filter((id): id is number => id !== null);
        const managerUserIds = teamData.map(t => t.managerId).filter((id): id is number => id !== null);
        const uniqueUserIds = Array.from(new Set([...playerUserIds, ...managerUserIds]));

        const allUsers = uniqueUserIds.length > 0
            ? await db.select().from(users).where(inArray(users.id, uniqueUserIds))
            : [];

        // Create mappings for O(1) lookups
        const userMap = new Map<number, any>((allUsers as any[]).map((u: any) => [u.id, u]));

        const teamPlayersMap = new Map<number, typeof allPlayers>();
        teamData.forEach(t => teamPlayersMap.set(t.id, []));
        allPlayers.forEach(p => {
            const teamArr = teamPlayersMap.get(p.teamId!);
            if (teamArr) teamArr.push(p);
        });

        // Assemble the final payload synchronously
        const result = teamData.map(team => {
            const tPlayers = teamPlayersMap.get(team.id) || [];

            const enrichedPlayers = tPlayers.map(p => {
                let enriched = { ...p };
                if (p.userId && userMap.has(p.userId)) {
                    const u = userMap.get(p.userId);
                    enriched.name = u.ign || u.username;
                    enriched.image = u.avatar || p.image;
                }

                // USE PRE-CALCULATED STATS FROM DB (Optimized)
                return {
                    ...enriched,
                    kda: p.kda || '0.00',
                    acs: p.acs || '0',
                    winRate: p.winRate || '0.0%'
                };
            });

            const finalPlayers = [...enrichedPlayers];
            const managerUser = team.managerId ? userMap.get(team.managerId) : undefined;

            if (managerUser && (managerUser.role?.includes('coach') || managerUser.role?.includes('manager'))) {
                // Check if they are already in the array
                const alreadyInArray = finalPlayers.some(p => p.userId === managerUser.id);
                if (!alreadyInArray) {
                    const isCoach = managerUser.role?.includes('coach');
                    const displayRole = isCoach ? 'Head Coach' : 'Team Manager';
                    const mockId = -(managerUser.id || 9999);

                    finalPlayers.unshift({
                        id: mockId,
                        teamId: team.id,
                        userId: managerUser.id,
                        name: managerUser.ign || managerUser.fullname || managerUser.username,
                        role: displayRole,
                        kda: '0.00',
                        winRate: '0.0%',
                        acs: '0',
                        image: managerUser.avatar || `https://ui-avatars.com/api/?name=${managerUser.username}&background=random`,
                        level: 1000000,
                        xp: 0,
                        isActive: true
                    } as any);
                }
            }

            return { ...team, players: finalPlayers };
        });

        // Cache result for 30s — busted automatically by notifyRefresh() on any write
        setCache(cacheKey, result);
        res.json({ success: true, data: result });

    } catch (error: any) {
        console.error("Error in GET /api/teams:", error.stack || error);
        res.status(500).json({ success: false, error: 'Failed to fetch teams', details: IS_PROD ? 'Check server logs' : error.message });
    }
});

app.get('/api/teams/:id', async (req, res) => {
    const id = Number(req.params.id);
    try {
        const [team] = await db.select().from(teams).where(eq(teams.id, id));
        if (!team) return res.status(404).json({ success: false, error: "Unit not found" });

        const teamPlayers = await db.select().from(players).where(eq(players.teamId, id));

        // Aggregate Career Stats for these players
        const uniqueUserIds = Array.from(new Set(teamPlayers.map(p => p.userId).filter((u): u is number => u !== null))) as number[];

        const [allUsers, allSStats, allTStats] = await Promise.all([
            uniqueUserIds.length > 0 ? db.select().from(users).where(inArray(users.id, uniqueUserIds)) : Promise.resolve([]),
            uniqueUserIds.length > 0 ? db.select({
                userId: players.userId,
                kills: scrimPlayerStats.kills,
                deaths: scrimPlayerStats.deaths,
                assists: scrimPlayerStats.assists,
                acs: scrimPlayerStats.acs,
                isWin: scrimPlayerStats.isWin
            }).from(scrimPlayerStats).innerJoin(players, eq(scrimPlayerStats.playerId, players.id)).where(inArray(players.userId, uniqueUserIds)) : Promise.resolve([]),
            uniqueUserIds.length > 0 ? db.select({
                userId: players.userId,
                kills: tournamentPlayerStats.kills,
                deaths: tournamentPlayerStats.deaths,
                assists: tournamentPlayerStats.assists,
                acs: tournamentPlayerStats.acs,
                isWin: tournamentPlayerStats.isWin
            }).from(tournamentPlayerStats).innerJoin(players, eq(tournamentPlayerStats.playerId, players.id)).where(inArray(players.userId, uniqueUserIds)) : Promise.resolve([]),
        ]);

        const consolidatedStats = [...allSStats, ...allTStats];
        const statsMap = new Map<number, any[]>();
        consolidatedStats.forEach(s => {
            if (!s.userId) return;
            if (!statsMap.has(s.userId)) statsMap.set(s.userId, []);
            statsMap.get(s.userId)!.push(s);
        });
        const userMap = new Map<number, any>((allUsers as any[]).map(u => [u.id, u]));

        const enrichedPlayers = teamPlayers.map(p => {
            let enriched = { ...p };
            if (p.userId && userMap.has(p.userId)) {
                const u = userMap.get(p.userId);
                enriched.name = u.ign || u.username;
                enriched.image = u.avatar || p.image;
            }

            const myStats = p.userId ? (statsMap.get(p.userId) || []) : [];
            let kda = "0.00", acs = "0", winRate = "0.0%";
            if (myStats.length > 0) {
                const totalAcs = myStats.reduce((acc, s) => acc + (s.acs || 0), 0);
                const sumKda = myStats.reduce((acc, s) => acc + ((s.kills + s.assists) / (s.deaths || 1)), 0);
                const wins = myStats.filter(s => s.isWin === 1).length;
                kda = (sumKda / myStats.length).toFixed(2);
                acs = Math.round(totalAcs / myStats.length).toString();
                winRate = `${((wins / myStats.length) * 100).toFixed(1)}%`;
            }
            return { ...enriched, kda, acs, winRate };
        });

        res.json({ success: true, data: { ...team, players: enrichedPlayers } });
    } catch (error) {
        console.error("Error in GET /api/teams/:id:", error);
        res.status(500).json({ success: false, error: "Database error" });
    }
});

app.get('/api/players', async (req, res) => {
    const { userId, decommissioned } = req.query;
    try {
        let playersData;
        const uId = userId && userId !== 'undefined' ? Number(userId) : NaN;

        if (decommissioned === 'true') {
            // CENTRALIZED ROBUST FILTERING: Find users who are TRULY inactive platform-wide

            // 1. Identify all User IDs active in players (assigned to a team)
            const activePlayerQuery = await db.select({ userId: players.userId }).from(players).where(isNotNull(players.teamId));
            const activePlayerIds = new Set(activePlayerQuery.map(r => r.userId).filter((id): id is number => id !== null));

            // 2. Identify all User IDs who are Managers
            const managerQuery = await db.select({ managerId: teams.managerId }).from(teams).where(isNotNull(teams.managerId));
            const managerIds = new Set(managerQuery.map(r => r.managerId).filter((id): id is number => id !== null));

            const activeUserIds = new Set([...activePlayerIds, ...managerIds]);

            // 3. Select unique decommissioned records (teamId is null) for users NOT in activeUserIds
            // We use a broader query and filter/deduplicate to ensure all historical data is handled
            const allInactiveRecords = await db.select({
                id: players.id,
                teamId: players.teamId,
                userId: players.userId,
                name: players.name,
                role: players.role,
                kda: players.kda,
                winRate: players.winRate,
                acs: players.acs,
                image: players.image,
                level: players.level,
                xp: players.xp,
                isActive: players.isActive,
                teamGame: teams.game
            })
                .from(players)
                .leftJoin(teams, eq(players.teamId, teams.id))
                .where(isNull(players.teamId));

            // Deduplicate by userId and ensure they aren't active elsewhere
            const deduplicated = new Map<number, any>();
            allInactiveRecords.forEach(p => {
                if (p.userId && !activeUserIds.has(p.userId) && !deduplicated.has(p.userId)) {
                    deduplicated.set(p.userId, p);
                }
            });

            playersData = Array.from(deduplicated.values());
        } else if (!isNaN(uId)) {
            playersData = await db.select({
                id: players.id,
                teamId: players.teamId,
                userId: players.userId,
                name: players.name,
                role: players.role,
                kda: players.kda,
                winRate: players.winRate,
                acs: players.acs,
                image: players.image,
                level: players.level,
                xp: players.xp,
                isActive: players.isActive,
                teamGame: teams.game
            })
                .from(players)
                .leftJoin(teams, eq(players.teamId, teams.id))
                .where(eq(players.userId, uId));
        } else {
            playersData = await db.select({
                id: players.id,
                teamId: players.teamId,
                userId: players.userId,
                name: players.name,
                role: players.role,
                kda: players.kda,
                winRate: players.winRate,
                acs: players.acs,
                image: players.image,
                level: players.level,
                xp: players.xp,
                isActive: players.isActive,
                teamGame: teams.game
            })
                .from(players)
                .leftJoin(teams, eq(players.teamId, teams.id));
        }

        const playersResult = playersData;
        if (playersResult.length === 0) return res.json({ success: true, data: [] });

        const uniqueUserIds = Array.from(new Set(playersResult.map(p => p.userId).filter((id): id is number => id !== null))) as number[];

        const [allUsers, allSStats, allTStats] = await Promise.all([
            uniqueUserIds.length > 0
                ? db.select().from(users).where(inArray(users.id, uniqueUserIds))
                : Promise.resolve([] as any[]),
            uniqueUserIds.length > 0
                ? db.select({
                    userId: players.userId,
                    kills: scrimPlayerStats.kills,
                    deaths: scrimPlayerStats.deaths,
                    assists: scrimPlayerStats.assists,
                    acs: scrimPlayerStats.acs,
                    isWin: scrimPlayerStats.isWin
                })
                    .from(scrimPlayerStats)
                    .innerJoin(players, eq(scrimPlayerStats.playerId, players.id))
                    .where(inArray(players.userId, uniqueUserIds))
                : Promise.resolve([] as any[]),
            uniqueUserIds.length > 0
                ? db.select({
                    userId: players.userId,
                    kills: tournamentPlayerStats.kills,
                    deaths: tournamentPlayerStats.deaths,
                    assists: tournamentPlayerStats.assists,
                    acs: tournamentPlayerStats.acs,
                    isWin: tournamentPlayerStats.isWin
                })
                    .from(tournamentPlayerStats)
                    .innerJoin(players, eq(tournamentPlayerStats.playerId, players.id))
                    .where(inArray(players.userId, uniqueUserIds))
                : Promise.resolve([] as any[]),
        ]);

        const consolidatedStats = [...allSStats, ...allTStats];
        const playerStatsMap = new Map<number, any[]>();
        consolidatedStats.forEach(s => {
            if (!s.userId) return;
            if (!playerStatsMap.has(s.userId)) playerStatsMap.set(s.userId, []);
            playerStatsMap.get(s.userId)!.push(s);
        });

        const userMap = new Map<number, any>((allUsers as any[]).map((u: any) => [u.id, u]));

        const enrichedPlayers = playersResult.map(p => {
            let enriched = { ...p };
            if (p.userId && userMap.has(p.userId)) {
                const u = userMap.get(p.userId);
                enriched.name = u.ign || u.username;
                enriched.image = u.avatar || p.image;
            }

            let kdaValue = 0;
            let avgAcs = 0;
            let winRateVal = 0;

            const myStats = p.userId ? (playerStatsMap.get(p.userId) || []) : [];
            if (myStats.length > 0) {
                const totalAcs = myStats.reduce((acc, s) => acc + (s.acs || 0), 0);
                const sumKda = myStats.reduce((acc, s) => {
                    const matchKda = (s.kills + s.assists) / (s.deaths || 1);
                    return acc + matchKda;
                }, 0);
                kdaValue = sumKda / myStats.length;
                avgAcs = Math.round(totalAcs / myStats.length);
                const wins = myStats.filter(s => s.isWin === 1).length;
                winRateVal = (wins / myStats.length) * 100;
            }

            return {
                ...enriched,
                kda: kdaValue.toFixed(2),
                acs: avgAcs.toString(),
                winRate: `${winRateVal.toFixed(1)}%`
            };
        });

        res.json({ success: true, data: enrichedPlayers });
    } catch (error: any) {
        console.error("Error in GET /api/players:", error);
        res.status(500).json({ success: false, error: 'Failed to fetch players', details: IS_PROD ? undefined : error.message });
    }
});

app.get('/api/players/:id/stats/breakdown', async (req, res) => {
    const playerId = Number(req.params.id);
    try {
        // 0. Get userId for this playerId to aggregate all their history
        const playerRecord = await db.select({ userId: players.userId }).from(players).where(eq(players.id, playerId)).limit(1);
        const uId = playerRecord[0]?.userId;

        // If we have a userId, find all playerIds for this user
        let allPlayerIds = [playerId];
        if (uId) {
            const allRecords = await db.select({ id: players.id }).from(players).where(eq(players.userId, uId));
            allPlayerIds = allRecords.map(r => r.id);
        }

        // 1. Fetch Scrim Stats
        const scrimStats = await db.select({
            id: scrimPlayerStats.id,
            scrimId: scrims.id,
            matchId: scrims.id, // Alias for frontend
            type: sql<string>`'scrim'`, // Constant type
            kills: scrimPlayerStats.kills,
            deaths: scrimPlayerStats.deaths,
            assists: scrimPlayerStats.assists,
            acs: scrimPlayerStats.acs,
            isWin: scrimPlayerStats.isWin,
            agent: scrimPlayerStats.agent,
            map: scrimPlayerStats.map,
            opponent: scrims.opponent,
            date: scrims.date
        })
            .from(scrimPlayerStats)
            .innerJoin(scrims, eq(scrimPlayerStats.scrimId, scrims.id))
            .where(inArray(scrimPlayerStats.playerId, allPlayerIds));

        // 2. Fetch Tournament Stats
        const tourneyStats = await db.select({
            id: tournamentPlayerStats.id,
            tournamentId: tournaments.id,
            matchId: tournaments.id, // Alias for frontend
            type: sql<string>`'tournament'`, // Constant type
            kills: tournamentPlayerStats.kills,
            deaths: tournamentPlayerStats.deaths,
            assists: tournamentPlayerStats.assists,
            acs: tournamentPlayerStats.acs,
            isWin: tournamentPlayerStats.isWin,
            agent: tournamentPlayerStats.agent,
            map: tournamentPlayerStats.map,
            opponent: tournaments.name,
            date: tournaments.date
        })
            .from(tournamentPlayerStats)
            .innerJoin(tournaments, eq(tournamentPlayerStats.tournamentId, tournaments.id))
            .where(inArray(tournamentPlayerStats.playerId, allPlayerIds));

        const allStats = [...scrimStats, ...tourneyStats];

        if (allStats.length === 0) {
            return res.json({ success: true, data: { agentStats: [], roleStats: [], mapStats: [], trendData: [] } });
        }

        // Trend data: sort matches by date
        const trendData = allStats
            .map((s: any) => ({
                date: s.date,
                acs: s.acs || 0
            }))
            .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const agentToRole: Record<string, string> = {
            'Jett': 'Duelist', 'Phoenix': 'Duelist', 'Neon': 'Duelist', 'Raze': 'Duelist', 'Reyna': 'Duelist', 'Yoru': 'Duelist', 'Iso': 'Duelist',
            'Sage': 'Sentinel', 'Cypher': 'Sentinel', 'Killjoy': 'Sentinel', 'Chamber': 'Sentinel', 'Deadlock': 'Sentinel', 'Vyse': 'Sentinel', 'Waylay': 'Sentinel', 'Veto': 'Sentinel',
            'Brimstone': 'Controller', 'Viper': 'Controller', 'Omen': 'Controller', 'Astra': 'Controller', 'Harbor': 'Controller', 'Clove': 'Controller',
            'Sova': 'Initiator', 'Breach': 'Initiator', 'Skye': 'Initiator', 'KAY_O': 'Initiator', 'KAY/O': 'Initiator', 'Fade': 'Initiator', 'Gekko': 'Initiator', 'Tejo': 'Initiator'
        };

        const normalizedRoles: Record<string, string> = {};
        Object.entries(agentToRole).forEach(([agent, role]) => {
            normalizedRoles[agent.toLowerCase().trim()] = role;
        });

        const agentMap: Record<string, { games: number, wins: number, draws: number, kills: number, deaths: number, assists: number, totalAcs: number }> = {};
        const roleMap: Record<string, { games: number, wins: number, draws: number, kills: number, deaths: number, assists: number, totalAcs: number }> = {};
        const mapResMap: Record<string, { games: number, wins: number, draws: number, totalAcs: number }> = {};
        allStats.forEach((s: any) => {
            // Map Stats
            const mapName = s.map || 'Unknown';
            if (!mapResMap[mapName]) mapResMap[mapName] = { games: 0, wins: 0, draws: 0, totalAcs: 0 };
            mapResMap[mapName].games++;
            if (s.isWin === 1) mapResMap[mapName].wins++;
            else if (s.isWin === 2) mapResMap[mapName].draws++;
            mapResMap[mapName].totalAcs += (s.acs || 0);

            // Agent Stats
            const agent = (s.agent || 'Unknown').trim();
            if (!agentMap[agent]) agentMap[agent] = { games: 0, wins: 0, draws: 0, kills: 0, deaths: 0, assists: 0, totalAcs: 0 };
            agentMap[agent].games++;
            if (s.isWin === 1) agentMap[agent].wins++;
            else if (s.isWin === 2) agentMap[agent].draws++;
            agentMap[agent].kills += (s.kills || 0);
            agentMap[agent].deaths += (s.deaths || 0);
            agentMap[agent].assists += (s.assists || 0);
            agentMap[agent].totalAcs += (s.acs || 0);

            // Role Stats
            const role = s.role || normalizedRoles[agent.toLowerCase()] || 'Unassigned';
            if (!roleMap[role]) roleMap[role] = { games: 0, wins: 0, draws: 0, kills: 0, deaths: 0, assists: 0, totalAcs: 0 };
            roleMap[role].games++;
            if (s.isWin === 1) roleMap[role].wins++;
            else if (s.isWin === 2) roleMap[role].draws++;
            roleMap[role].kills += (s.kills || 0);
            roleMap[role].deaths += (s.deaths || 0);
            roleMap[role].assists += (s.assists || 0);
            roleMap[role].totalAcs += (s.acs || 0);

            // Inject role into stat for frontend filtering
            s.role = role;
        });

        // Ensure Specific Assets are represented if data exists or even as 0-placeholders for new content
        const mandatoryAgents: string[] = []; // Removed 'Veto' as it should only show if data exists
        const mandatoryMaps: string[] = [];

        mandatoryAgents.forEach(a => {
            if (!agentMap[a]) agentMap[a] = { games: 0, wins: 0, draws: 0, kills: 0, deaths: 0, assists: 0, totalAcs: 0 };
        });
        mandatoryMaps.forEach(m => {
            if (!mapResMap[m]) mapResMap[m] = { games: 0, wins: 0, draws: 0, totalAcs: 0 };
        });

        const agentStats = Object.keys(agentMap).map(name => {
            const data = agentMap[name];
            const decisive = data.games - data.draws;
            return {
                name,
                games: data.games,
                wins: data.wins,
                draws: data.draws,
                losses: decisive - data.wins,
                winRate: decisive > 0 ? Math.round((data.wins / decisive) * 100) : 0,
                kd: ((data.kills + (data.assists || 0)) / (data.deaths || 1)).toFixed(2),
                acs: data.games > 0 ? Math.round(data.totalAcs / data.games) : 0
            };
        }).sort((a, b) => b.games - a.games);

        const roleStats = Object.keys(roleMap).map(name => {
            const data = roleMap[name];
            const decisive = data.games - data.draws;
            return {
                name,
                games: data.games,
                wins: data.wins,
                draws: data.draws,
                losses: decisive - data.wins,
                winRate: decisive > 0 ? Math.round((data.wins / decisive) * 100) : 0,
                kd: ((data.kills + (data.assists || 0)) / (data.deaths || 1)).toFixed(2),
                acs: data.games > 0 ? Math.round(data.totalAcs / data.games) : 0
            };
        }).sort((a, b) => b.games - a.games);

        const mapStats = Object.keys(mapResMap).map(name => {
            const data = mapResMap[name];
            const decisive = data.games - data.draws;
            return {
                name,
                games: data.games,
                wins: data.wins,
                draws: data.draws,
                losses: decisive - data.wins,
                winRate: decisive > 0 ? Math.round((data.wins / decisive) * 100) : 0,
                acs: data.games > 0 ? Math.round(data.totalAcs / data.games) : 0
            };
        }).sort((a, b) => b.games - a.games);

        res.json({ success: true, data: { agentStats, roleStats, mapStats, trendData, history: allStats } });

    } catch (error: any) {
        console.error("Error fetching breakdown:", error);
        res.status(500).json({ success: false, error: 'Failed to fetch breakdown' });
    }
});

// Manager Routes (POST)
app.post('/api/teams', async (req, res) => {
    const { name, game, description, managerId, requesterId } = req.body;
    if (!name || !game) return res.status(400).json({ success: false, error: 'Missing team name or game' });

    try {
        // Authorization check
        if (!requesterId) return res.status(401).json({ success: false, error: 'Unauthorized: Requester ID required.' });
        const requesterRows = await db.select().from(users).where(eq(users.id, Number(requesterId)));
        const requester = requesterRows[0];
        if (!requester || !['admin', 'ceo', 'manager'].some(r => requester.role?.includes(r))) {
            return res.status(403).json({ success: false, error: 'Access Denied: Only Admin, CEO, or Manager can initialize new units.' });
        }
        const newTeamRes = await db.insert(teams).values({
            name,
            game,
            description,
            managerId: managerId ? Number(managerId) : null
        }).returning();
        const newTeam = newTeamRes[0];
        notifyRefresh();
        res.json({ success: true, data: newTeam });
    } catch (error: any) {
        console.error("Error in POST /api/teams:", error);
        res.status(500).json({ success: false, error: 'Failed to create team', details: error.message });
    }
});

app.put('/api/teams/:id/manager', async (req, res) => {
    const { id } = req.params;
    const { managerId, requesterId } = req.body;
    try {
        // Authorization check
        if (!requesterId) return res.status(401).json({ success: false, error: 'Unauthorized: Requester ID required.' });
        const requesterRows = await db.select().from(users).where(eq(users.id, Number(requesterId)));
        const requester = requesterRows[0];
        if (!requester || !['admin', 'ceo', 'manager'].some(r => requester.role?.includes(r))) {
            return res.status(403).json({ success: false, error: 'Access Denied: Only Admin, CEO, or Manager can reassign unit command.' });
        }
        await db.update(teams).set({ managerId: managerId ? Number(managerId) : null }).where(eq(teams.id, Number(id)));
        notifyRefresh();
        res.json({ success: true });
    } catch (error: any) {
        console.error("Error in PUT /api/teams/:id/manager:", error);
        res.status(500).json({ success: false, error: 'Failed to update team manager', details: error.message });
    }
});

// Advanced Analytics
app.get('/api/analytics/performers', async (req, res) => {
    try {
        const teamId = req.query.teamId;
        let pList;
        const analyticsResult: any = { players: [] };

        if (teamId && teamId !== 'all') {
            const tid = Number(teamId);
            pList = await db.select().from(players).where(eq(players.teamId, tid));

            // Map Stats for specified team
            const teamScrims = await db.select().from(scrims).where(eq(scrims.teamId, tid));
            const mapData: Record<string, { played: number, wins: number }> = {};

            for (const s of teamScrims) {
                const scrimMaps = JSON.parse(s.maps || '[]');
                const scrimResults = JSON.parse(s.results || '[]'); // maps results

                scrimMaps.forEach((mapName: string, idx: number) => {
                    if (!mapData[mapName]) mapData[mapName] = { played: 0, wins: 0 };
                    mapData[mapName].played++;
                    const result = scrimResults.find((r: any) => r.mapName === mapName || r.map === (idx + 1));
                    if (result && result.score === 'WIN') mapData[mapName].wins++;
                });
            }
            analyticsResult.mapStats = Object.entries(mapData).map(([name, stats]) => ({
                name,
                winRate: Math.round((stats.wins / stats.played) * 100)
            }));
        } else {
            pList = await db.select().from(players);
        }

        if (pList.length > 0) {
            const playerIds = pList.map(p => p.id);
            const allStats = await db.select().from(scrimPlayerStats).where(inArray(scrimPlayerStats.playerId, playerIds));

            const statsMap = new Map<number, typeof allStats>();
            allStats.forEach(s => {
                if (!statsMap.has(s.playerId)) statsMap.set(s.playerId, []);
                statsMap.get(s.playerId)!.push(s);
            });

            for (const p of pList) {
                const playerStats = statsMap.get(p.id) || [];
                if (playerStats.length > 0) {
                    const avgKda = playerStats.reduce((acc, s) => acc + (s.kills + s.assists) / (s.deaths || 1), 0) / playerStats.length;
                    const avgAcs = playerStats.reduce((acc, s) => acc + (s.acs || 0), 0) / playerStats.length;
                    analyticsResult.players.push({
                        name: p.name,
                        teamId: p.teamId,
                        kda: avgKda.toFixed(2),
                        acs: Math.round(avgAcs)
                    });
                }
            }
        }
        res.json({ success: true, data: analyticsResult });
    } catch (error: any) {
        console.error("Error in GET /api/analytics/performers:", error);
        res.status(500).json({ success: false, error: 'Failed to aggregate analytics', details: IS_PROD ? undefined : error.message });
    }
});

// ── Weekly Reports History ───────────────────────────────────────────────────────
// GET /api/reports/history  → list all stored weekly snapshots (newest first)
app.get('/api/reports/history', async (req, res) => {
    try {
        const all = await db.select({
            id: weeklyReports.id,
            weekStart: weeklyReports.weekStart,
            weekEnd: weeklyReports.weekEnd,
            generatedAt: weeklyReports.generatedAt,
        }).from(weeklyReports);
        // Sort newest first
        all.sort((a, b) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
        res.json({ success: true, data: all });
    } catch (error: any) {
        console.error('[HISTORY] list failed:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch report history', details: error.message });
    }
});

// GET /api/reports/history/:id  → full data for one past report
app.get('/api/reports/history/:id', async (req, res) => {
    try {
        const reportRows = await db.select().from(weeklyReports).where(eq(weeklyReports.id, Number(req.params.id)));
        const report = reportRows[0];
        if (!report) return res.status(404).json({ success: false, error: 'Report not found' });
        const data = JSON.parse(report.reportData);

        // Normalize legacy or inconsistent snapshot data for the Unified Hub
        if (data.summary) {
            if (data.summary.wins === undefined) {
                data.summary.wins = (data.summary.scrimWins || 0) + (data.summary.tourWins || 0);
            }
            if (data.summary.losses === undefined) {
                data.summary.losses = (data.summary.scrimLosses || 0) + (data.summary.tourLosses || 0);
            }
            if (data.summary.pendingScrims === undefined) {
                data.summary.pendingScrims = (data.summary.pending || data.summary.pendingScrims || 0);
            }
        }
        res.json({ success: true, data });
    } catch (error: any) {
        console.error("History fetch failed:", error);
        res.status(500).json({ success: false, error: 'Failed to fetch historical report', details: error.message });
    }
});

app.get('/api/reports/weekly', async (req, res) => {
    try {
        const today = new Date();
        const { start: startOfWeek, end: endOfWeek } = getSundaySaturdayRange(today);
        const filterTeamId = req.query.teamId ? Number(req.query.teamId) : undefined;
        const requesterId = req.query.requesterId ? Number(req.query.requesterId) : undefined;

        let requester = null;
        if (requesterId) {
            const requesterRows = await db.select().from(users).where(eq(users.id, Number(requesterId)));
            requester = requesterRows[0];
        }

        const isAdmin = requester?.role?.includes('admin') || requester?.role?.includes('ceo');

        let scrimsQuery = db.select().from(scrims);
        let toursQuery = db.select().from(tournaments);

        if (filterTeamId) {
            // If specific team requested, verify access if not admin
            if (!isAdmin && requesterId) {
                const teamRows = await db.select().from(teams).where(eq(teams.id, filterTeamId));
                const team = teamRows[0];
                const isMember = await db.select().from(players).where(and(eq(players.teamId, filterTeamId), eq(players.userId, requesterId)));

                if (team?.managerId !== requesterId && isMember.length === 0) {
                    return res.json({ success: true, data: { summary: {}, allTime: {}, teamSummaries: {} } });
                }
            }
            scrimsQuery = scrimsQuery.where(eq(scrims.teamId, filterTeamId)) as any;
            toursQuery = toursQuery.where(eq(tournaments.teamId, filterTeamId)) as any;
        } else if (!isAdmin && requesterId) {
            // Global view for non-admins: filter for teams they are part of
            const accessFilter = sql`EXISTS (
                SELECT 1 FROM ${teams} 
                WHERE ${teams.id} = team_id 
                AND (${teams.managerId} = ${requesterId} 
                     OR EXISTS (SELECT 1 FROM ${players} WHERE ${players.teamId} = ${teams.id} AND ${players.userId} = ${requesterId}))
            )`;

            // Note: drizzle-orm handle table aliasing, so we need to be careful with raw SQL if tables aren't aliased correctly.
            // But since these are simple separate queries, it should be fine.
            scrimsQuery = scrimsQuery.where(
                sql`EXISTS (SELECT 1 FROM ${teams} WHERE ${teams.id} = ${scrims.teamId} AND (${teams.managerId} = ${requesterId} OR EXISTS (SELECT 1 FROM ${players} WHERE ${players.teamId} = ${teams.id} AND ${players.userId} = ${requesterId})))`
            ) as any;
            toursQuery = toursQuery.where(
                sql`EXISTS (SELECT 1 FROM ${teams} WHERE ${teams.id} = ${tournaments.teamId} AND (${teams.managerId} = ${requesterId} OR EXISTS (SELECT 1 FROM ${players} WHERE ${players.teamId} = ${teams.id} AND ${players.userId} = ${requesterId})))`
            ) as any;
        } else if (!isAdmin && !requesterId) {
            // Safety: if not admin and no requesterId, return empty
            return res.json({ success: true, data: { summary: {}, allTime: {}, teamSummaries: {} } });
        }

        let [allScrims, allTournaments] = await Promise.all([
            scrimsQuery,
            toursQuery
        ]);

        // Filter to current week (only for weekly mode, but keep all records for deckStats)
        const filteredScrims = allScrims.filter(s => {
            const d = new Date(s.date);
            return d >= startOfWeek && d <= endOfWeek;
        });

        const filteredTours = allTournaments.filter(t => {
            const d = new Date(t.date);
            return d >= startOfWeek && d <= endOfWeek;
        });

        // All-time totals (for Citadel Deck overall stats)
        const allTimeScrims = allScrims.filter(s => s.status === 'completed');
        let allTimeWins = 0, allTimeLosses = 0, allTimeDraws = 0;
        for (const s of allTimeScrims) {
            const results = JSON.parse(s.results || '[]');
            const ws = results.filter((r: any) => parseIsWin(r.score, r.isVictory) === 1).length;
            const ls = results.filter((r: any) => parseIsWin(r.score, r.isVictory) === 0).length;

            if (results.length > 0) {
                if (ws > ls) allTimeWins++;
                else if (ws < ls) allTimeLosses++;
                else allTimeDraws++;
            }
        }

        const summary: any = {
            totalScrims: filteredScrims.length,
            totalTournaments: filteredTours.length,
            wins: 0,
            losses: 0,
            pending: 0,
            teamSummaries: {},
            allTime: {
                total: allTimeScrims.length,
                wins: allTimeWins,
                losses: allTimeLosses,
                draws: allTimeDraws,
                winRate: (allTimeWins + allTimeLosses + allTimeDraws) > 0 ? Math.round((allTimeWins / (allTimeWins + allTimeLosses + allTimeDraws)) * 100) : 0
            }
        };

        const teamsData = await db.select().from(teams);
        const teamMap: Record<number, string> = {};
        teamsData.forEach(t => { teamMap[t.id] = t.name; });

        for (const s of filteredScrims) {
            if (!summary.teamSummaries[s.teamId!]) {
                summary.teamSummaries[s.teamId!] = {
                    name: teamMap[s.teamId!] || 'Unknown Team',
                    wins: 0,
                    losses: 0,
                    pending: 0,
                    total: 0
                };
            }
            summary.teamSummaries[s.teamId!].total++;
            if (s.status === 'pending') {
                summary.pending++;
                summary.teamSummaries[s.teamId!].pending++;
            } else {
                const results = JSON.parse(s.results || '[]');
                const ws = results.filter((r: any) => parseIsWin(r.score, r.isVictory) === 1).length;
                const ls = results.filter((r: any) => parseIsWin(r.score, r.isVictory) === 0).length;

                if (ws > ls) {
                    summary.wins++;
                    summary.teamSummaries[s.teamId!].wins++;
                } else if (ws < ls) {
                    summary.losses++;
                    summary.teamSummaries[s.teamId!].losses++;
                } else if (results.length > 0) {
                    if (!summary.draws) summary.draws = 0;
                    summary.draws++;
                    if (!summary.teamSummaries[s.teamId!].draws) summary.teamSummaries[s.teamId!].draws = 0;
                    summary.teamSummaries[s.teamId!].draws++;
                }
            }
        }

        // Add Tournaments to global summary
        for (const t of filteredTours) {
            if (t.status === 'pending') {
                summary.pending++;
            } else {
                const results = JSON.parse(t.results || '[]');
                const ws = results.filter((r: any) => parseIsWin(r.score, r.isVictory) === 1).length;
                const ls = results.filter((r: any) => parseIsWin(r.score, r.isVictory) === 0).length;

                if (ws > ls) summary.wins++;
                else if (ws < ls) summary.losses++;
                else if (results.length > 0) {
                    if (!summary.draws) summary.draws = 0;
                    summary.draws++;
                }
            }
        }

        res.json({
            success: true,
            data: {
                summary: {
                    totalScrims: summary.totalScrims,
                    totalTournaments: summary.totalTournaments,
                    wins: summary.wins,
                    losses: summary.losses,
                    draws: summary.draws || 0,
                    pendingScrims: summary.pending,
                    scrimWinRate: (summary.wins + summary.losses + (summary.draws || 0)) > 0 ? Math.round((summary.wins / (summary.wins + summary.losses + (summary.draws || 0))) * 100) : 0,
                    orgVelocity: summary.totalScrims + summary.totalTournaments
                },
                allTime: summary.allTime,
                teamSummaries: summary.teamSummaries
            }
        });
    } catch (error: any) {
        console.error("Error in GET /api/reports/weekly:", error.stack || error);
        res.status(500).json({ success: false, error: 'Failed to generate report', details: IS_PROD ? 'Check server logs' : error.message });
    }
});


// --- PLAYER QUOTA SYSTEM ---

/**
 * Returns the ISO date string (YYYY-MM-DD) for the Monday of the week containing the given date.
 */
// Helper to get Monday of a week as YYYY-MM-DD (local time safe)
function getMondayISO(d: Date) {
    const date = new Date(d);
    const day = date.getDay();
    // Monday is 1, Sunday is 0. If Sunday, go back 6 days, otherwise go back to Monday.
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    monday.setHours(0, 0, 0, 0);

    // Use local components to avoid toISOString() timezone shift
    const y = monday.getFullYear();
    const m = String(monday.getMonth() + 1).padStart(2, '0');
    const dayStr = String(monday.getDate()).padStart(2, '0');
    return `${y}-${m}-${dayStr}`;
}

// Get Team Quotas & Player Progress for a given week
app.get('/api/teams/:id/quotas', async (req, res) => {
    try {
        const teamId = Number(req.params.id);
        let weekParam = req.query.week as string;
        if (weekParam && weekParam.includes(':')) {
            weekParam = weekParam.split(':')[0];
        }
        const weekStart = weekParam || getMondayISO(new Date());

        // Basic validation for weekStart format (YYYY-MM-DD or similar)
        if (!weekStart || !/^\d{4}-\d{2}-\d{2}/.test(weekStart)) {
            console.error("Invalid week format provided:", weekStart);
            // Attempt to recover if it's just a malformed string or fallback to today's Monday
            return res.status(400).json({ success: false, error: 'Invalid week format. Expected YYYY-MM-DD.' });
        }

        const dateCheck = new Date(weekStart);
        if (isNaN(dateCheck.getTime())) {
            return res.status(400).json({ success: false, error: 'Invalid date provided.' });
        }

        // 1. Fetch Roster Quota Settings
        const teamRows = await db.select().from(teams).where(eq(teams.id, teamId));
        const team = teamRows[0];
        if (!team) return res.status(404).json({ success: false, error: 'Team not found' });

        const isShooting = team?.game && (GAME_CATEGORY[team.game as keyof typeof GAME_CATEGORY] === 'FPS' || GAME_CATEGORY[team.game as keyof typeof GAME_CATEGORY] === 'BR' || GAME_CATEGORY[team.game as keyof typeof GAME_CATEGORY] === 'VALORANT');

        const baseQuotaRows = await db.select().from(rosterQuotas).where(eq(rosterQuotas.teamId, teamId));
        let baseQuota = baseQuotaRows[0];
        if (!baseQuota) {
            baseQuota = { teamId, baseAimKills: 0, baseGrindRG: 0, id: 0, reducedAimKills: 0, reducedGrindRG: 0, updatedAt: new Date() };
        }

        // 2. Fetch Team Players (Excluding Coaches)
        const teamPlayers = await db.select().from(players).where(
            and(
                eq(players.teamId, teamId),
                notIlike(players.role, '%coach%')
            )
        );

        // 3. Aggregate Progress
        const playersWithQuotas = await Promise.all(teamPlayers.map(async (player) => {
            const progressRows = await db.select().from(playerQuotaProgress)
                .where(and(eq(playerQuotaProgress.playerId, player.id), eq(playerQuotaProgress.weekStart, weekStart)));
            let progress = progressRows[0];

            // Auto-initialize progress if missing for the requested week
            if (!progress) {
                const prevDate = new Date(weekStart);
                if (isNaN(prevDate.getTime())) {
                    throw new Error(`Critical Date Error: Unable to parse weekStart ${weekStart}`);
                }
                prevDate.setDate(prevDate.getDate() - 7);
                const prevWeekStart = getMondayISO(prevDate); // Use the safe helper

                const prevProgressRows = await db.select().from(playerQuotaProgress)
                    .where(and(eq(playerQuotaProgress.playerId, player.id), eq(playerQuotaProgress.weekStart, prevWeekStart)));
                const prevProgress = prevProgressRows[0];

                let pKills = 0, pRG = 0, cKills = 0, cRG = 0;

                if (prevProgress) {
                    const bK = baseQuota.baseAimKills || 0;
                    const bR = baseQuota.baseGrindRG || 0;

                    const aimGoal = bK + (prevProgress.punishmentKills || 0) + (prevProgress.carryOverKills || 0);
                    const grindGoal = bR + (prevProgress.punishmentRG || 0) + (prevProgress.carryOverRG || 0);

                    if (prevProgress.totalAimKills < aimGoal) {
                        pKills = 250;
                        cKills = Math.max(0, aimGoal - prevProgress.totalAimKills);
                    }
                    if (prevProgress.totalGrindRG < grindGoal) {
                        pRG = 10;
                        cRG = Math.max(0, grindGoal - prevProgress.totalGrindRG);
                    }
                }

                const newProgressRows = await db.insert(playerQuotaProgress).values({
                    playerId: player.id,
                    weekStart: weekStart,
                    aimStatus: 'pending',
                    grindStatus: 'pending',
                    totalAimKills: 0,
                    totalGrindRG: 0,
                    aimProof: '[]',
                    assignedBaseAim: baseQuota.baseAimKills || 0,
                    assignedBaseGrind: baseQuota.baseGrindRG || 0,
                    punishmentKills: pKills,
                    punishmentRG: pRG,
                    carryOverKills: cKills,
                    carryOverRG: cRG
                }).returning();
                progress = newProgressRows[0];
            } else if ((progress.assignedBaseAim === 0 || progress.assignedBaseAim === null) && (progress.assignedBaseGrind === 0 || progress.assignedBaseGrind === null)) {
                // Feature transition: lock in current base quotas for existing records that haven't been snapshotted yet
                await db.update(playerQuotaProgress)
                    .set({
                        assignedBaseAim: baseQuota.baseAimKills || 0,
                        assignedBaseGrind: baseQuota.baseGrindRG || 0
                    })
                    .where(eq(playerQuotaProgress.id, progress.id));
                progress.assignedBaseAim = baseQuota.baseAimKills || 0;
                progress.assignedBaseGrind = baseQuota.baseGrindRG || 0;
            }

            return {
                ...player,
                progress
            };
        }));

        res.json({
            success: true,
            data: {
                baseQuota,
                players: playersWithQuotas
            }
        });
    } catch (error: any) {
        console.error("Quota Fetch Error:", error);
        res.status(500).json({ success: false, error: "Failed to fetch quotas", details: IS_PROD ? undefined : error.message });
    }
});

// Update Roster Base Quota
app.post('/api/teams/:id/settings/quota', async (req, res) => {
    try {
        const teamId = Number(req.params.id);
        const { baseAimKills, baseGrindRG, reducedAimKills, reducedGrindRG, requesterId } = req.body;

        // Authorization check
        if (!requesterId) return res.status(401).json({ success: false, error: 'Unauthorized: Requester ID required.' });
        const requesterRows = await db.select().from(users).where(eq(users.id, Number(requesterId)));
        const requester = requesterRows[0];
        const isManager = requester?.role?.includes('manager') || requester?.role?.includes('coach');
        const isAdmin = requester?.role?.includes('admin') || requester?.role?.includes('ceo');

        if (!isAdmin && !isManager) {
            return res.status(403).json({ success: false, error: 'Access Denied: Insufficient clearance for protocol modification.' });
        }

        if (isManager && !isAdmin) {
            const teamRows = await db.select().from(teams).where(eq(teams.id, teamId));
            if (teamRows[0]?.managerId !== Number(requesterId)) {
                return res.status(403).json({ success: false, error: 'Access Denied: You do not have command authority over this unit.' });
            }
        }

        const existingRows = await db.select().from(rosterQuotas).where(eq(rosterQuotas.teamId, teamId));
        const existing = existingRows[0];
        if (existing) {
            await db.update(rosterQuotas)
                .set({ baseAimKills, baseGrindRG, reducedAimKills, reducedGrindRG, updatedAt: new Date() })
                .where(eq(rosterQuotas.teamId, teamId));
        } else {
            await db.insert(rosterQuotas).values({ teamId, baseAimKills, baseGrindRG, reducedAimKills, reducedGrindRG });
        }
        notifyRefresh();
        res.json({ success: true, message: 'Settings updated' });
    } catch (error: any) {
        console.error("Quota Update Error:", error);
        res.status(500).json({ success: false, error: "Failed to update team settings", details: IS_PROD ? undefined : error.message });
    }
});

// Update Player Progress
app.post('/api/players/:id/quota/update', async (req, res) => {
    try {
        const playerId = Number(req.params.id);
        const { weekStart, aimProof, grindProof, aimStatus, grindStatus } = req.body;

        const aimKillsTotal = JSON.parse(aimProof || '[]').reduce((sum: number, item: any) => sum + (Number(item.kills) || 0), 0);
        const grindRGTotal = JSON.parse(grindProof || '[]').reduce((sum: number, item: any) => sum + (Number(item.games) || 0), 0);

        const progressRows = await db.select().from(playerQuotaProgress)
            .where(and(eq(playerQuotaProgress.playerId, playerId), eq(playerQuotaProgress.weekStart, weekStart)));
        const progress = progressRows[0];

        if (!progress) return res.status(404).json({ success: false, error: "Quota record not found for this week" });

        await db.update(playerQuotaProgress)
            .set({
                aimProof,
                grindProof,
                totalAimKills: aimKillsTotal,
                totalGrindRG: grindRGTotal,
                aimStatus: aimStatus || progress.aimStatus,
                grindStatus: grindStatus || progress.grindStatus,
                updatedAt: new Date()
            })
            .where(eq(playerQuotaProgress.id, progress.id));
        notifyRefresh();
        res.json({ success: true, data: { totalAimKills: aimKillsTotal, totalGrindRG: grindRGTotal } });
    } catch (error: any) {
        console.error("Progress Update Error:", error);
        res.status(500).json({ success: false, error: "Failed to update progress", details: IS_PROD ? undefined : error.message });
    }
});

// Review Player Quota Progress (Approve/Reject)
app.post('/api/players/:id/quota/review', async (req, res) => {
    try {
        const playerId = Number(req.params.id);
        const { weekStart, aimStatus, grindStatus, requesterId } = req.body;

        // Authorization check
        if (!requesterId) return res.status(401).json({ success: false, error: 'Unauthorized: Requester ID required.' });
        const requesterRows = await db.select().from(users).where(eq(users.id, Number(requesterId)));
        const requester = requesterRows[0];
        const isManager = requester?.role?.includes('manager') || requester?.role?.includes('coach');
        const isAdmin = requester?.role?.includes('admin') || requester?.role?.includes('ceo');

        if (!isAdmin && !isManager) {
            return res.status(403).json({ success: false, error: 'Access Denied: Insufficient clearance for performance review.' });
        }

        const playerRows = await db.select().from(players).where(eq(players.id, playerId));
        const player = playerRows[0];
        if (!player) return res.status(404).json({ success: false, error: 'Operative not found.' });

        if (isManager && !isAdmin) {
            const teamRows = await db.select().from(teams).where(eq(teams.id, player.teamId!));
            if (teamRows[0]?.managerId !== Number(requesterId)) {
                return res.status(403).json({ success: false, error: 'Access Denied: You do not have command authority over this unit.' });
            }
        }

        const progressRows = await db.select().from(playerQuotaProgress)
            .where(and(eq(playerQuotaProgress.playerId, playerId), eq(playerQuotaProgress.weekStart, weekStart)));
        const progress = progressRows[0];

        if (!progress) return res.status(404).json({ success: false, error: "Quota record not found" });

        await db.update(playerQuotaProgress)
            .set({
                aimStatus: aimStatus || progress.aimStatus,
                grindStatus: grindStatus || progress.grindStatus,
                updatedAt: new Date()
            })
            .where(eq(playerQuotaProgress.id, progress.id));
        notifyRefresh();
        res.json({ success: true, message: 'Quota reviewed' });
    } catch (error: any) {
        console.error("Quota Review Error:", error);
        res.status(500).json({ success: false, error: "Failed to review quota", details: IS_PROD ? undefined : error.message });
    }
});

// Set Individual Weekly Quota Overwrite
app.post('/api/players/:id/quota/custom', async (req, res) => {
    try {
        const playerId = Number(req.params.id);
        const { weekStart, assignedBaseAim, assignedBaseGrind, requesterId } = req.body;

        // Authorization check
        if (!requesterId) return res.status(401).json({ success: false, error: 'Unauthorized: Requester ID required.' });
        const requesterRows = await db.select().from(users).where(eq(users.id, Number(requesterId)));
        const requester = requesterRows[0];
        const isManager = requester?.role?.includes('manager') || requester?.role?.includes('coach');
        const isAdmin = requester?.role?.includes('admin') || requester?.role?.includes('ceo');

        if (!isAdmin && !isManager) {
            return res.status(403).json({ success: false, error: 'Access Denied: Insufficient clearance for quota override.' });
        }

        const playerRows = await db.select().from(players).where(eq(players.id, playerId));
        const player = playerRows[0];
        if (!player) return res.status(404).json({ success: false, error: 'Operative not found.' });

        if (isManager && !isAdmin) {
            const teamRows = await db.select().from(teams).where(eq(teams.id, player.teamId!));
            if (teamRows[0]?.managerId !== Number(requesterId)) {
                return res.status(403).json({ success: false, error: 'Access Denied: You do not have command authority over this unit.' });
            }
        }

        const progressRows = await db.select().from(playerQuotaProgress)
            .where(and(eq(playerQuotaProgress.playerId, playerId), eq(playerQuotaProgress.weekStart, weekStart)));
        const progress = progressRows[0];

        if (!progress) return res.status(404).json({ success: false, error: "Quota record not found for this week" });

        // Check if already modified this week
        if (progress.isCustomQuotaApplied) {
            return res.status(400).json({ success: false, error: "Access Denied: Units are only permitted one tactical quota adjustment per weekly cycle." });
        }

        await db.update(playerQuotaProgress)
            .set({
                assignedBaseAim: Number(assignedBaseAim),
                assignedBaseGrind: Number(assignedBaseGrind),
                isCustomQuotaApplied: true,
                updatedAt: new Date()
            })
            .where(eq(playerQuotaProgress.id, progress.id));
        notifyRefresh();
        res.json({ success: true, message: 'Custom quota set' });
    } catch (error: any) {
        console.error("Custom Quota Error:", error);
        res.status(500).json({ success: false, error: "Failed to set custom quota", details: IS_PROD ? undefined : error.message });
    }
});

// --- Reporting & Telemetry Logic ---

/**
 * Calculates the Sunday-Saturday range for the current week.
 * Sunday is the start, Saturday is the end.
 */
function getSundaySaturdayRange(referenceDate: Date = new Date()) {
    const start = new Date(referenceDate);
    const day = referenceDate.getDay(); // 0 (Sun) to 6 (Sat)
    start.setDate(referenceDate.getDate() - day);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    return { start, end };
}

export async function generateAndSendWeeklyReport() {
    try {
        const today = new Date();
        const { start: startOfWeek, end: endOfWeek } = getSundaySaturdayRange(today);

        // Use startOfWeek for filtering data
        const filterDate = startOfWeek;

        // 1. Fetch all data
        const allScrims = await db.select().from(scrims);
        const allTournaments = await db.select().from(tournaments);
        const allTeams = await db.select().from(teams);
        const allPlayers = await db.select().from(players);
        const allAchievements = await db.select().from(achievements);
        const allEvents = await db.select().from(events);
        const allSponsors = await db.select().from(sponsors);

        const recentScrims = allScrims.filter(s => {
            const d = new Date(s.date);
            return d >= startOfWeek && d <= endOfWeek;
        });
        const recentTournaments = allTournaments.filter(t => {
            const d = new Date(t.date);
            return d >= startOfWeek && d <= endOfWeek;
        });
        const recentAchievements = allAchievements.filter(a => new Date(a.date) >= filterDate);
        const upcomingEvents = allEvents.filter(e => new Date(e.date) >= new Date()).slice(0, 5);

        const teamMap: Record<number, string> = {};
        allTeams.forEach(t => { teamMap[t.id] = t.name; });


        // 2. Per-team scrim stats (Weekly Filtered)
        const scrimTeamStats: Record<number, { name: string; wins: number; losses: number; pending: number; total: number; maps: Record<string, { w: number; t: number }> }> = {};
        recentScrims.forEach(s => {
            const tid = s.teamId!;
            if (!scrimTeamStats[tid]) scrimTeamStats[tid] = { name: teamMap[tid] || 'Unknown', wins: 0, losses: 0, pending: 0, total: 0, maps: {} };

            scrimTeamStats[tid].total++;
            if (s.status === 'pending') {
                scrimTeamStats[tid].pending++;
            } else {
                let results: any[] = []; try { results = JSON.parse(s.results || '[]'); } catch { }
                let mapsArr: string[] = []; try { mapsArr = JSON.parse(s.maps || '[]'); } catch { }

                const ws = results.filter((r: any) => parseIsWin(r.score, r.isVictory) === 1).length;
                const ls = results.filter((r: any) => parseIsWin(r.score, r.isVictory) === 0).length;
                const isWin = ws > ls;
                const isDraw = ws === ls && results.length > 0;

                if (isWin) scrimTeamStats[tid].wins++;
                else if (!isDraw) scrimTeamStats[tid].losses++;
                mapsArr.forEach((m: string, i: number) => {
                    if (!scrimTeamStats[tid].maps[m]) scrimTeamStats[tid].maps[m] = { w: 0, t: 0 };
                    scrimTeamStats[tid].maps[m].t++;
                    const isVictory = parseIsWin(results[i]?.score, results[i]?.isVictory) === 1;
                    if (isVictory) scrimTeamStats[tid].maps[m].w++;
                });
            }
        });

        // 3. Per-team tournament stats (Weekly Filtered)
        const tourTeamStats: Record<number, { name: string; wins: number; losses: number; pending: number; total: number; formats: Record<string, number> }> = {};
        recentTournaments.forEach(t => {
            const tid = t.teamId!;
            if (!tourTeamStats[tid]) tourTeamStats[tid] = { name: teamMap[tid] || 'Unknown', wins: 0, losses: 0, pending: 0, total: 0, formats: {} };

            tourTeamStats[tid].total++;
            if (t.status === 'pending') {
                tourTeamStats[tid].pending++;
            } else {
                let results: any[] = []; try { results = JSON.parse(t.results || '[]'); } catch { }
                const ws = results.filter((r: any) => parseIsWin(r.score, r.isVictory) === 1).length;
                const ls = results.filter((r: any) => parseIsWin(r.score, r.isVictory) === 0).length;
                const isWin = ws > ls;
                const isDraw = ws === ls && results.length > 0;
                if (isWin) tourTeamStats[tid].wins++;
                else if (!isDraw) tourTeamStats[tid].losses++;
            }
            const fmt = t.format || 'Unknown';
            tourTeamStats[tid].formats[fmt] = (tourTeamStats[tid].formats[fmt] || 0) + 1;
        });

        // Top rosters by weekly win rate (Completed matches only)
        const topScrimRosters = Object.values(scrimTeamStats)
            .filter(t => (t.total - t.pending) > 0)
            .map(t => ({ ...t, winRate: (t.wins / (t.total - t.pending)) * 100 }))
            .sort((a, b) => b.winRate - a.winRate).slice(0, 5);

        // Top rosters by weekly tournament win rate
        const topTourRosters = Object.values(tourTeamStats)
            .filter(t => (t.total - t.pending) > 0)
            .map(t => ({ ...t, winRate: (t.wins / (t.total - t.pending)) * 100 }))
            .sort((a, b) => b.winRate - a.winRate).slice(0, 5);

        // Top players
        const topByACS = [...allPlayers].sort((a, b) => Number(b.acs || 0) - Number(a.acs || 0)).slice(0, 5);
        const topByKDA = [...allPlayers].sort((a, b) => Number(b.kda || 0) - Number(a.kda || 0)).slice(0, 5);

        // Global map win rates
        const globalMapWins: Record<string, { w: number; t: number }> = {};
        Object.values(scrimTeamStats).forEach(ts => {
            Object.entries(ts.maps).forEach(([map, v]) => {
                if (!globalMapWins[map]) globalMapWins[map] = { w: 0, t: 0 };
                globalMapWins[map].w += v.w;
                globalMapWins[map].t += v.t;
            });
        });
        const topMaps = Object.entries(globalMapWins)
            .map(([name, v]) => ({ name, winRate: v.t > 0 ? Math.round((v.w / v.t) * 100) : 0 }))
            .sort((a, b) => b.winRate - a.winRate).slice(0, 6);

        // ── PDF ──────────────────────────────────────────────────────────────
        const GOLD = '#D4AF37';
        const PURPLE = '#2D0B5A';
        const PARCHMENT = '#FDF5E6';
        const TEXT_COLOR = '#1a1a1a';
        const L_MARGIN = 60;
        const CHART_WIDTH = 420;

        const pdfFileName = `WC_Royal_Edict_${Date.now()}.pdf`;
        const pdfPath = resolve(process.cwd(), pdfFileName);
        const { default: PDFDocument } = await import('pdfkit');
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const writeStream = fs.createWriteStream(pdfPath);
        doc.pipe(writeStream);

        const addPageBg = () => {
            doc.rect(0, 0, 595, 842).fill(PARCHMENT);
            doc.lineWidth(3).strokeColor(GOLD).rect(18, 18, 559, 806).stroke();
            doc.lineWidth(1).rect(23, 23, 549, 796).stroke();
        };

        const addSectionHeader = (title: string) => {
            if (doc.y > 720) { doc.addPage(); addPageBg(); doc.moveDown(2); }
            doc.fillColor(PURPLE).fontSize(14).font('Times-Bold').text(title, L_MARGIN);
            doc.lineWidth(1.5).strokeColor(GOLD).moveTo(L_MARGIN, doc.y + 2).lineTo(535, doc.y + 2).stroke();
            doc.moveDown(1.2);
        };

        const addBar = (label: string, value: number, maxVal: number, suffix = '') => {
            const y = doc.y;
            const bw = maxVal > 0 ? Math.max((value / maxVal) * CHART_WIDTH, 2) : 2;
            doc.fillColor('#e8e0c8').rect(L_MARGIN, y, CHART_WIDTH, 16).fill();
            doc.fillColor(GOLD).rect(L_MARGIN, y, bw, 16).fill();
            doc.fillColor(PURPLE).fontSize(9).font('Times-Bold').text(label.toUpperCase(), L_MARGIN + 4, y + 4);
            doc.fillColor(PURPLE).text(`${value}${suffix}`, L_MARGIN + CHART_WIDTH + 8, y + 4);
            doc.y = y + 20;
        };

        // ── PAGE 1: COVER ──────────────────────────────────────────────────
        addPageBg();
        doc.rect(18, 18, 559, 120).fill(PURPLE);
        doc.fillColor(GOLD).fontSize(26).font('Times-Bold').text('ROYAL PERFORMANCE EDICT', 18, 38, { align: 'center', width: 559 });
        doc.fontSize(11).font('Times-Roman').text('WC ESPORTS — COMPREHENSIVE COMMAND INTELLIGENCE', 18, 72, { align: 'center', width: 559 });
        doc.fontSize(9).text(`DECREED: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} | STATUS: SOVEREIGN & CONFIDENTIAL`, 18, 92, { align: 'center', width: 559 });

        doc.y = 160;

        // ── SECTION 1: EXECUTIVE SUMMARY ──────────────────────────────────
        addSectionHeader('I. EXECUTIVE SUMMARY');

        const totalScrimWins = Object.values(scrimTeamStats).reduce((a, t) => a + t.wins, 0);
        const totalScrimLosses = Object.values(scrimTeamStats).reduce((a, t) => a + t.losses, 0);
        const totalScrimPending = Object.values(scrimTeamStats).reduce((a, t) => a + t.pending, 0);
        const totalScrimTotal = totalScrimWins + totalScrimLosses;

        const totalTourWins = Object.values(tourTeamStats).reduce((a, t) => a + t.wins, 0);
        const totalTourLosses = Object.values(tourTeamStats).reduce((a, t) => a + t.losses, 0);
        const totalTourPending = Object.values(tourTeamStats).reduce((a, t) => a + t.pending, 0);
        const totalTourTotal = totalTourWins + totalTourLosses;

        const summaryData = [
            ['METRIC', 'VALUE'],
            ['Total Teams Registered', `${allTeams.length}`],
            ['Total Players Registered', `${allPlayers.length}`],
            ['Total Scrims (All Time)', `${allScrims.length}`],
            ['Scrims This Week', `${recentScrims.length}`],
            ['Pending Scrims (Systemic)', `${totalScrimPending}`],
            ['Scrim Win Rate (Completed)', totalScrimTotal > 0 ? `${Math.round((totalScrimWins / totalScrimTotal) * 100)}%` : 'N/A'],
            ['Total Tournaments (All Time)', `${allTournaments.length}`],
            ['Tournaments This Week', `${recentTournaments.length}`],
            ['Pending Tournies (Systemic)', `${totalTourPending}`],
            ['Tournament Win Rate (Completed)', totalTourTotal > 0 ? `${Math.round((totalTourWins / totalTourTotal) * 100)}%` : 'N/A'],
            ['Active Sponsors/Partners', `${allSponsors.length}`],
        ];

        summaryData.forEach(([k, v], i) => {
            if (i === 0) {
                doc.fillColor(PURPLE).fontSize(10).font('Times-Bold').text(k, L_MARGIN, doc.y, { continued: true, width: 300 });
                doc.text(v, { align: 'right', width: 220 });
            } else {
                const rowY = doc.y;
                if (i % 2 === 0) doc.fillColor('#f0e8d0').rect(L_MARGIN, rowY - 2, 460, 16).fill();
                doc.fillColor(TEXT_COLOR).fontSize(10).font('Times-Roman').text(k, L_MARGIN + 4, rowY, { continued: true, width: 296 });
                doc.fillColor(PURPLE).font('Times-Bold').text(v, { align: 'right', width: 160 });
            }
        });

        doc.moveDown(1.5);

        // ── SECTION 2: SCRIM ANALYTICS ────────────────────────────────────
        addSectionHeader('II. SCRIM NETWORK ANALYTICS');

        // Weekly combine status bars
        doc.fillColor(TEXT_COLOR).fontSize(10).font('Times-Bold').text('Weekly Combined Engagement Status (Scrims & Tournies):', L_MARGIN);
        doc.moveDown(0.5);

        const totalOps = recentScrims.length + recentTournaments.length;
        const maxOps = Math.max(totalOps, 1);

        const combinedWins = totalScrimWins + totalTourWins;
        const combinedPending = totalScrimPending + totalTourPending;
        const combinedLosses = totalOps - combinedWins - combinedPending;

        addBar('Total Victories', combinedWins, maxOps);
        addBar('Operational Losses', combinedLosses, maxOps);
        addBar('Pending Engagements', combinedPending, maxOps);
        doc.moveDown(0.8);

        // Top scrim rosters
        doc.fillColor(TEXT_COLOR).fontSize(10).font('Times-Bold').text('Top Performing Squads (Scrim Win Rate):', L_MARGIN);
        doc.moveDown(0.5);
        if (topScrimRosters.length === 0) {
            doc.fillColor(TEXT_COLOR).fontSize(10).font('Times-Roman').text('No completed scrims on record.', L_MARGIN + 10);
        } else {
            topScrimRosters.forEach(r => addBar(`${r.name}  (${r.wins}W-${r.losses}L)`, Math.round(r.winRate), 100, '%'));
        }
        doc.moveDown(0.8);

        // Per-team detailed breakdown
        if (Object.values(scrimTeamStats).length > 0) {
            doc.fillColor(TEXT_COLOR).fontSize(10).font('Times-Bold').text('Full Team Scrim Breakdown:', L_MARGIN);
            doc.moveDown(0.4);
            const headers = ['Team', 'W', 'L', 'P', 'WR%'];
            const colX = [L_MARGIN + 4, L_MARGIN + 240, L_MARGIN + 280, L_MARGIN + 320, L_MARGIN + 380];
            doc.fillColor(PURPLE).fontSize(9).font('Times-Bold');
            headers.forEach((h, i) => doc.text(h, colX[i], doc.y, { continued: i < headers.length - 1 }));
            doc.lineWidth(0.5).strokeColor(GOLD).moveTo(L_MARGIN, doc.y + 2).lineTo(535, doc.y + 2).stroke();
            doc.moveDown(0.5);
            Object.values(scrimTeamStats).sort((a, b) => (b.wins / (b.total || 1)) - (a.wins / (a.total || 1))).forEach((t, idx) => {
                const wr = t.total > t.pending ? Math.round((t.wins / (t.total - t.pending)) * 100) : 0;
                if (idx % 2 === 0) doc.fillColor('#f0e8d0').rect(L_MARGIN, doc.y - 1, 460, 14).fill();
                doc.fillColor(TEXT_COLOR).fontSize(9).font('Times-Roman');
                doc.text(t.name, colX[0], doc.y, { continued: true, width: 230 });
                doc.text(`${t.wins}`, colX[1], doc.y, { continued: true, width: 30 });
                doc.text(`${t.losses}`, colX[2], doc.y, { continued: true, width: 30 });
                doc.text(`${t.pending}`, colX[3], doc.y, { continued: true, width: 40 });
                doc.fillColor(wr >= 60 ? '#2d6a4f' : wr >= 40 ? '#7d5a00' : PURPLE).font('Times-Bold').text(`${wr}%`, colX[4], doc.y);
            });
        }
        doc.moveDown(1.5);

        // ── SECTION 3: MAP INTELLIGENCE ─────────────────────────────────
        if (topMaps.length > 0) {
            addSectionHeader('III. THEATER MAP INTELLIGENCE');
            doc.fillColor(TEXT_COLOR).fontSize(10).font('Times-Bold').text('Global Map Win Rate (All Scrims Combined):', L_MARGIN);
            doc.moveDown(0.5);
            topMaps.forEach(m => addBar(m.name, m.winRate, 100, '%'));
            doc.moveDown(1.5);
        }

        // ── SECTION 4: TOURNAMENT ANALYTICS ──────────────────────────────
        addSectionHeader('IV. TOURNAMENT NETWORK ANALYTICS');

        // Top tournament rosters
        doc.fillColor(TEXT_COLOR).fontSize(10).font('Times-Bold').text('Top Performing Squads (Tournament Win Rate):', L_MARGIN);
        doc.moveDown(0.5);
        if (topTourRosters.length === 0) {
            doc.fillColor(TEXT_COLOR).fontSize(10).font('Times-Roman').text('No completed tournaments on record.', L_MARGIN + 10);
        } else {
            topTourRosters.forEach(r => addBar(`${r.name}  (${r.wins}W-${r.losses}L)`, Math.round(r.winRate), 100, '%'));
        }
        doc.moveDown(0.8);

        // Per-team tournament breakdown
        if (Object.values(tourTeamStats).length > 0) {
            doc.fillColor(TEXT_COLOR).fontSize(10).font('Times-Bold').text('Full Team Tournament Breakdown:', L_MARGIN);
            doc.moveDown(0.4);
            const colX2 = [L_MARGIN + 4, L_MARGIN + 240, L_MARGIN + 280, L_MARGIN + 320, L_MARGIN + 380];
            doc.fillColor(PURPLE).fontSize(9).font('Times-Bold');
            ['Team', 'W', 'L', 'P', 'WR%'].forEach((h, i, arr) => doc.text(h, colX2[i], doc.y, { continued: i < arr.length - 1 }));
            doc.lineWidth(0.5).strokeColor(GOLD).moveTo(L_MARGIN, doc.y + 2).lineTo(535, doc.y + 2).stroke();
            doc.moveDown(0.5);
            Object.values(tourTeamStats).sort((a, b) => (b.wins / (b.total || 1)) - (a.wins / (a.total || 1))).forEach((t, idx) => {
                const wr = t.total > t.pending ? Math.round((t.wins / (t.total - t.pending)) * 100) : 0;
                if (idx % 2 === 0) doc.fillColor('#f0e8d0').rect(L_MARGIN, doc.y - 1, 460, 14).fill();
                doc.fillColor(TEXT_COLOR).fontSize(9).font('Times-Roman');
                doc.text(t.name, colX2[0], doc.y, { continued: true, width: 230 });
                doc.text(`${t.wins}`, colX2[1], doc.y, { continued: true, width: 30 });
                doc.text(`${t.losses}`, colX2[2], doc.y, { continued: true, width: 30 });
                doc.text(`${t.pending}`, colX2[3], doc.y, { continued: true, width: 40 });
                doc.fillColor(wr >= 60 ? '#2d6a4f' : wr >= 40 ? '#7d5a00' : PURPLE).font('Times-Bold').text(`${wr}%`, colX2[4], doc.y);
            });
        }
        doc.moveDown(1.5);

        // ── SECTION 5: PLAYER LEADERBOARD ─────────────────────────────────
        addSectionHeader('V. CHAMPIONS OF THE REALM (Player Leaderboard)');

        doc.fillColor(TEXT_COLOR).fontSize(10).font('Times-Bold').text('Top 5 by Average Combat Score (ACS):', L_MARGIN);
        doc.moveDown(0.5);
        const maxAcs = Math.max(...topByACS.map(p => Number(p.acs || 0)), 1);
        topByACS.forEach(p => addBar(p.name, Number(p.acs || 0), maxAcs));
        doc.moveDown(0.8);

        doc.fillColor(TEXT_COLOR).fontSize(10).font('Times-Bold').text('Top 5 by Kill/Death/Assist Ratio (KDA):', L_MARGIN);
        doc.moveDown(0.4);
        const maxKda = Math.max(...topByKDA.map(p => Number(p.kda || 0)), 1);
        topByKDA.forEach(p => addBar(p.name, Number(p.kda || 0), maxKda));
        doc.moveDown(1.5);

        // ── SECTION 6: RECENT TRIUMPHS ────────────────────────────────────
        if (recentAchievements.length > 0) {
            addSectionHeader('VI. RECENT TRIUMPHS');
            recentAchievements.slice(0, 5).forEach(a => {
                doc.fillColor(TEXT_COLOR).fontSize(10).font('Times-Bold').text(`• ${a.title}  [${a.placement || 'Finalist'}]`, L_MARGIN + 10);
                doc.fontSize(9).font('Times-Roman').fillColor('#444').text(a.description || '', L_MARGIN + 20, doc.y, { width: 460 });
                doc.moveDown(0.4);
            });
            doc.moveDown(1);
        }

        // ── SECTION 7: UPCOMING EVENTS ────────────────────────────────────
        if (upcomingEvents.length > 0) {
            addSectionHeader('VII. FUTURE DECREES (Upcoming Events)');
            upcomingEvents.forEach(e => {
                const d = new Date(e.date).toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' });
                doc.fillColor(TEXT_COLOR).fontSize(10).font('Times-Bold').text(`• ${e.title}`, L_MARGIN + 10, doc.y, { continued: true });
                doc.fillColor(PURPLE).font('Times-Roman').text(`  ${d}`, { align: 'right', width: 300 });
                if (e.location) doc.fillColor('#666').fontSize(9).text(`  ${e.location}`, L_MARGIN + 20);
                doc.moveDown(0.3);
            });
            doc.moveDown(1);
        }

        // ── SECTION 8: PARTNERS & SPONSORS ───────────────────────────────
        if (allSponsors.length > 0) {
            addSectionHeader('VIII. IMPERIAL PATRONS (Sponsors & Partners)');
            const tiers = ['Platinum', 'Gold', 'Silver', 'Bronze'];
            tiers.forEach(tier => {
                const inTier = allSponsors.filter(s => s.tier === tier);
                if (inTier.length === 0) return;
                doc.fillColor(PURPLE).fontSize(10).font('Times-Bold').text(`${tier.toUpperCase()} TIER`, L_MARGIN + 4);
                doc.fillColor(TEXT_COLOR).fontSize(9).font('Times-Roman').text(inTier.map(s => s.name).join('  •  '), L_MARGIN + 16, doc.y, { width: 460 });
                doc.moveDown(0.5);
            });
            doc.moveDown(1);
        }

        // Footer on last page
        doc.fillColor(PURPLE).fontSize(8).font('Times-Italic')
            .text('By Royal Decree of the WC Executive Council. All metrics verified and sovereign. This document is confidential.', 18, 808, { align: 'center', width: 559 });

        doc.end();
        await finished(writeStream);

        // 5. SAVE SNAPSHOT TO VAULT (CONSOLIDATED HISTORY)
        let reportSnapshotData: any = null;
        try {
            const today = new Date();
            reportSnapshotData = {
                summary: {
                    totalScrims: recentScrims.length,
                    totalTournaments: recentTournaments.length,
                    totalTeams: allTeams.length,
                    totalPlayers: allPlayers.length,
                    wins: totalScrimWins + totalTourWins,
                    losses: totalScrimLosses + totalTourLosses,
                    pendingScrims: totalScrimPending + totalTourPending,
                    scrimWins: totalScrimWins,
                    scrimLosses: totalScrimLosses,
                    tourWins: totalTourWins,
                    tourLosses: totalTourLosses,
                    scrimWinRate: totalScrimTotal > 0 ? ((totalScrimWins / totalScrimTotal) * 100).toFixed(1) : '0',
                    tourWinRate: totalTourTotal > 0 ? ((totalTourWins / totalTourTotal) * 100).toFixed(1) : '0',
                    orgVelocity: recentScrims.length + recentTournaments.length,
                    reportScope: 'WEEKLY_OPERATIONS'
                },
                teamSummaries: scrimTeamStats,
                tournamentSummaries: tourTeamStats,
                topScrimRosters,
                topTourRosters,
                topByACS,
                topByKDA,
                topMaps,
                upcomingEvents,
                allSponsors: allSponsors.map(s => ({ name: s.name, tier: s.tier }))
            };

            const weekStartStr = startOfWeek.toLocaleDateString('sv-SE');
            const weekEndStr = endOfWeek.toLocaleDateString('sv-SE');

            // --- UPSERT LOGIC ---
            // Check if a report for this specific week already exists
            const existingRows = await db.select().from(weeklyReports)
                .where(and(eq(weeklyReports.weekStart, weekStartStr), eq(weeklyReports.weekEnd, weekEndStr)));
            const existing = existingRows[0];

            if (existing) {
                await db.update(weeklyReports)
                    .set({
                        generatedAt: today.toISOString(),
                        reportData: JSON.stringify(reportSnapshotData),
                        pdfPath: pdfFileName
                    })
                    .where(eq(weeklyReports.id, existing.id));
                console.log(`[VAULT] Performance snapshot UPDATED for period ${weekStartStr} to ${weekEndStr}`);
            } else {
                await db.insert(weeklyReports).values({
                    weekStart: weekStartStr,
                    weekEnd: weekEndStr,
                    generatedAt: today.toISOString(),
                    reportData: JSON.stringify(reportSnapshotData),
                    pdfPath: pdfFileName
                });
                console.log(`[VAULT] Performance snapshot ARCHIVED for period ${weekStartStr} to ${weekEndStr}`);
            }
            notifyRefresh();
        } catch (snapshotError) {
            console.error('[VAULT] Snapshot failed:', snapshotError);
        }

        // Standardized summary mapping for non-snapshot usage
        const finalSummary = reportSnapshotData ? {
            ...reportSnapshotData.summary,
            totalOperations: reportSnapshotData.summary.orgVelocity,
            topPlayer: topByACS[0]?.name || 'N/A',
            topRoster: topScrimRosters[0]?.name || 'N/A'
        } : {
            totalScrims: recentScrims.length,
            totalTournaments: recentTournaments.length,
            wins: totalScrimWins + totalTourWins,
            losses: totalScrimLosses + totalTourLosses,
            pendingScrims: totalScrimPending + totalTourPending,
            scrimWinRate: totalScrimTotal > 0 ? ((totalScrimWins / totalScrimTotal) * 100).toFixed(1) : '0',
            orgVelocity: recentScrims.length + recentTournaments.length,
            totalOperations: recentScrims.length + recentTournaments.length,
            topPlayer: topByACS[0]?.name || 'N/A',
            topRoster: topScrimRosters[0]?.name || 'N/A'
        };

        // Ensure PDF results match these calculations
        console.log(`[EDICT] Logic Audit Complete. Weekly Combat: ${finalSummary.wins}W / ${finalSummary.losses}L (Velocity: ${finalSummary.orgVelocity})`);

        // 6. Email Dispatch
        const gmailUser = process.env.GMAIL_USER;
        const gmailPass = process.env.GMAIL_APP_PASS;
        const CEO_EMAIL = 'emersonwaque@gmail.com';

        if (!gmailUser || !gmailPass) {
            console.warn('[EMAIL] GMAIL_USER or GMAIL_APP_PASS not found. Skipping email.');
            return {
                success: true,
                message: 'Royal Edict generated but email skipped (missing credentials)',
                pdfPath,
                reportSummary: finalSummary
            };
        }

        const { default: nodemailer } = await import('nodemailer');
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: gmailUser, pass: gmailPass }
        });

        const emailBody = [
            `By Royal Decree of the WC Executive Council,`,
            ``,
            `Attached is the comprehensive Royal Performance Edict covering all active divisions.`,
            ``,
            `Period: ${startOfWeek.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} to ${endOfWeek.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
            ``,
            `── EXECUTIVE SUMMARY ──`,
            `Teams: ${allTeams.length}  |  Players: ${allPlayers.length}`,
            `Scrims (All Time): ${allScrims.length}  |  This Week: ${recentScrims.length}`,
            `Scrim Win Rate: ${totalScrimTotal > 0 ? Math.round((totalScrimWins / totalScrimTotal) * 100) : 0}%  (${totalScrimWins}W / ${totalScrimLosses}L)`,
            `Tournaments (All Time): ${allTournaments.length}  |  This Week: ${recentTournaments.length}`,
            `Tournament Win Rate: ${totalTourTotal > 0 ? Math.round((totalTourWins / totalTourTotal) * 100) : 0}%  (${totalTourWins}W / ${totalTourLosses}L)`,
            ``,
            `── TOP COMBATANTS ──`,
            ...topByACS.slice(0, 3).map((p, i) => `${i + 1}. ${p.name}  ACS: ${p.acs}`),
            ``,
            `── TOP SCRIM ROSTERS ──`,
            ...topScrimRosters.slice(0, 3).map((r, i) => `${i + 1}. ${r.name}  ${Math.round(r.winRate)}% WR (${r.wins}W-${r.losses}L)`),
            ``,
            `── TOP TOURNAMENT ROSTERS ──`,
            ...topTourRosters.slice(0, 3).map((r, i) => `${i + 1}. ${r.name}  ${Math.round(r.winRate)}% WR (${r.wins}W-${r.losses}L)`),
            ``,
            `Full breakdown archived in the Citadel.`,
            ``,
            `— WC Royal Intelligence Division`,
        ].join('\n');

        const mailOptions = {
            from: `"WC Royal Intelligence" <${gmailUser}>`,
            to: CEO_EMAIL,
            cc: gmailUser,
            subject: `[WC Royal Edict] Performance Report — ${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} to ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
            text: emailBody,
            attachments: [{ filename: pdfFileName, path: pdfPath }]
        };

        await transporter.sendMail(mailOptions);
        console.log(`[EMAIL] Royal Edict dispatched to ${CEO_EMAIL}`);

        return {
            success: true,
            message: `Royal Performance Edict generated and dispatched to ${CEO_EMAIL}`,
            reportSummary: finalSummary
        };

    } catch (e) {
        console.error("Report Generation failed:", e);
        throw e;
    }
}

app.post('/api/reports/telemetry/push', async (req, res) => {
    try {
        const result = await generateAndSendWeeklyReport();
        res.json({ success: true, data: result });
    } catch (e: any) {
        console.error("Telemetry Push Error:", e);
        res.status(500).json({ success: false, error: 'Failed to push telemetry', details: IS_PROD ? undefined : e.message });
    }
});





app.post('/api/seed/managers', async (req, res) => {
    try {
        // Create 3 Managers
        const managerNames = ['Manager Alpha', 'Manager Beta', 'Manager Gamma'];
        const createdManagers = [];

        for (const name of managerNames) {
            const username = name.toLowerCase().replace(' ', '_');
            // Check if exists
            const userRows = await db.select().from(users).where(eq(users.username, username));
            let user = userRows[0];
            if (!user) {
                const newUserRows = await db.insert(users).values({
                    username,
                    password: 'password123',
                    email: `${username}@nxc.com`,
                    fullname: name,
                    role: 'manager'
                }).returning();
                user = newUserRows[0];
            } else {
                await db.update(users).set({ role: 'manager' }).where(eq(users.id, user.id));
            }
            createdManagers.push(user);
        }

        // Create 2 Teams for each manager
        for (const manager of createdManagers) {
            for (let i = 1; i <= 2; i++) {
                const teamName = `${manager.fullname} Squad ${i}`;
                const existingRows = await db.select().from(teams).where(eq(teams.name, teamName));
                const existing = existingRows[0];
                if (!existing) {
                    await db.insert(teams).values({
                        name: teamName,
                        game: 'Valorant',
                        managerId: manager.id,
                        description: `Test team for ${manager.fullname}`
                    });
                }
            }
        }

        res.json({ success: true, message: 'Managers and teams seeded successfully' });
    } catch (error: any) {
        console.error("Error in POST /api/seed/managers:", error);
        res.status(500).json({ success: false, error: 'Failed to seed data', details: IS_PROD ? undefined : error.message });
    }
});

app.post('/api/teams/:id/players', async (req, res) => {
    const { id } = req.params;
    const { name, role, kda, winRate, userId, requesterId } = req.body;

    // Authorization check
    if (!requesterId) return res.status(401).json({ success: false, error: 'Unauthorized: Requester ID required.' });
    const requesterRows = await db.select().from(users).where(eq(users.id, Number(requesterId)));
    const requester = requesterRows[0];
    const isManager = requester?.role?.includes('manager') || requester?.role?.includes('coach');
    const isAdmin = requester?.role?.includes('admin') || requester?.role?.includes('ceo');

    if (!isAdmin && !isManager) {
        return res.status(403).json({ success: false, error: 'Access Denied: Insufficient clearance for asset assignment.' });
    }

    // If manager, check if they manage THIS team
    if (isManager && !isAdmin) {
        const teamRows = await db.select().from(teams).where(eq(teams.id, Number(id)));
        if (teamRows[0]?.managerId !== Number(requesterId)) {
            return res.status(403).json({ success: false, error: 'Access Denied: You do not have command authority over this unit.' });
        }
    }

    // If userId provided, verify user exists
    let targetUserId = userId ? Number(userId) : null;
    let playerName = name;

    try {
        if (targetUserId) {
            const userRows = await db.select().from(users).where(eq(users.id, targetUserId));
            const u = userRows[0];
            if (!u) return res.status(404).json({ success: false, error: 'User to add not found' });
            playerName = u.ign || u.username;

            // Grant secondary role if member
            if (u.role === 'member') {
                await db.update(users).set({ role: 'member,player' }).where(eq(users.id, targetUserId));
            }
        }

        const newPlayerRows = await db.insert(players).values({
            teamId: Number(id),
            userId: targetUserId,
            name: playerName, // Store current name as fallback/record
            role, kda, winRate,
            image: `https://ui-avatars.com/api/?name=${playerName}&background=random` // Default image if no user avatar
        }).returning();
        const newPlayer = newPlayerRows[0];

        // Refresh user role if it was current user or broadcast (simplified: just return new role info if helpful)
        notifyRefresh();
        res.json({ success: true, data: { player: newPlayer, newRole: 'member,player' } });
    } catch (error: any) {
        console.error("Error in POST /api/teams/:id/players:", error);
        res.status(500).json({ success: false, error: 'Failed to add player', details: IS_PROD ? undefined : error.message });
    }
});

app.delete('/api/teams/:teamId/players/:playerId', async (req, res) => {
    const { teamId, playerId } = req.params;
    const requesterId = req.query.requesterId ? Number(req.query.requesterId) : null;

    if (!requesterId) return res.status(401).json({ success: false, error: 'Unauthorized: Requester ID required.' });

    try {
        const requesterRows = await db.select().from(users).where(eq(users.id, requesterId));
        const requester = requesterRows[0];
        const isManager = requester?.role?.includes('manager') || requester?.role?.includes('coach');
        const isAdmin = requester?.role?.includes('admin') || requester?.role?.includes('ceo');

        if (!isAdmin && !isManager) {
            return res.status(403).json({ success: false, error: 'Access Denied: Insufficient clearance for asset decommissioning.' });
        }

        if (isManager && !isAdmin) {
            const teamRows = await db.select().from(teams).where(eq(teams.id, Number(teamId)));
            if (teamRows[0]?.managerId !== requesterId) {
                return res.status(403).json({ success: false, error: 'Access Denied: You do not have command authority over this unit.' });
            }
        }
        const playerRows = await db.select().from(players).where(eq(players.id, Number(playerId)));
        const p = playerRows[0];
        if (p && p.userId) {
            // Check if they are in any other teams
            const userPlayers = await db.select().from(players).where(eq(players.userId, p.userId));
            const stillInOtherTeams = userPlayers.some(up => up.teamId !== null && up.id !== Number(playerId));

            if (!stillInOtherTeams) {
                const userRows = await db.select().from(users).where(eq(users.id, p.userId));
                const u = userRows[0];
                if (u && u.role === 'member,player') {
                    await db.update(users).set({ role: 'member' }).where(eq(users.id, p.userId));
                }
            }
        }

        await db.update(players)
            .set({ teamId: null, isActive: false })
            .where(and(eq(players.teamId, Number(teamId)), eq(players.id, Number(playerId))));
        notifyRefresh();
        res.json({ success: true });
    } catch (error: any) {
        console.error("Error in DELETE /api/teams/:teamId/players/:playerId:", error);
        res.status(500).json({ success: false, error: 'Failed to remove player', details: IS_PROD ? undefined : error.message });
    }
});

// Scrim Routes
app.get('/api/scrims', async (req, res) => {
    const { teamId, requesterId } = req.query;
    try {
        const cacheKey = `scrims:${teamId ?? 'all'}:${requesterId ?? 'guest'}`;
        const cached = getCache(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        let requester = null;
        let isAdmin = false;

        // 1. Parallelize Auth and Authorization data
        const [requesterRow, teamData, isMemberRows] = await Promise.all([
            requesterId ? db.select().from(users).where(eq(users.id, Number(requesterId))) : Promise.resolve([]),
            teamId ? db.select().from(teams).where(eq(teams.id, Number(teamId))) : Promise.resolve([]),
            (teamId && requesterId) ? db.select().from(players).where(and(eq(players.teamId, Number(teamId)), eq(players.userId, Number(requesterId)))) : Promise.resolve([])
        ]);

        requester = requesterRow[0];
        isAdmin = requester?.role?.includes('admin') || requester?.role?.includes('ceo');

        let q = db.select().from(scrims);

        if (teamId) {
            // Verify access unless admin
            if (!isAdmin && requesterId) {
                const team = teamData[0];
                const isMember = isMemberRows.length > 0;

                if (team?.managerId !== Number(requesterId) && !isMember) {
                    setCache(cacheKey, []);
                    return res.json({ success: true, data: [] });
                }
            }
            q = q.where(eq(scrims.teamId, Number(teamId)));
        } else if (!isAdmin && requesterId) {
            q = q.where(
                sql`EXISTS (
                    SELECT 1 FROM ${teams} 
                    WHERE ${teams.id} = ${scrims.teamId} 
                    AND (${teams.managerId} = ${Number(requesterId)} 
                         OR EXISTS (SELECT 1 FROM ${players} WHERE ${players.teamId} = ${teams.id} AND ${players.userId} = ${Number(requesterId)}))
                )`
            );
        } else if (!isAdmin && !requesterId) {
            return res.json({ success: true, data: [] });
        }

        const data = await q;
        setCache(cacheKey, data);
        res.json({ success: true, data });
    } catch (error: any) {
        console.error("Error in GET /api/scrims:", error);
        res.status(500).json({ success: false, error: 'Failed to fetch scrims', details: error.message });
    }
});

// Consolidated with earlier route

app.post('/api/scrims', async (req, res) => {
    const { teamId, date, opponent, format, maps, requesterId } = req.body;
    if (!teamId || !date || !opponent || !format) return res.status(400).json({ success: false, error: 'Missing fields' });

    try {
        // Authorization check
        if (!requesterId) return res.status(401).json({ success: false, error: 'Unauthorized: Requester ID required.' });
        const requesterRows = await db.select().from(users).where(eq(users.id, Number(requesterId)));
        const requester = requesterRows[0];
        const isManager = requester?.role?.includes('manager') || requester?.role?.includes('coach');
        const isAdmin = requester?.role?.includes('admin') || requester?.role?.includes('ceo');

        if (!isAdmin && !isManager) {
            return res.status(403).json({ success: false, error: 'Access Denied: Insufficient clearance for scheduling operations.' });
        }

        if (isManager && !isAdmin) {
            const teamRows = await db.select().from(teams).where(eq(teams.id, Number(teamId)));
            if (teamRows[0]?.managerId !== Number(requesterId)) {
                return res.status(403).json({ success: false, error: 'Access Denied: You do not have command authority over this unit.' });
            }
        }
        const newScrimRows = await db.insert(scrims).values({
            teamId: Number(teamId),
            date, opponent, format, status: 'pending',
            maps: maps ? JSON.stringify(maps) : null
        }).returning();
        const newScrim = newScrimRows[0];

        notifyRefresh();
        // Website Notification
        const scrimTitle = "New Scrim Scheduled";
        const scrimMsg = `A scrim against ${opponent} (${format}) has been scheduled for ${new Date(date).toLocaleString()}. Maps: ${Array.isArray(maps) ? maps.join(', ') : 'TBD'}.`;
        sendWebsiteNotification(Number(teamId), scrimTitle, scrimMsg, 'scrim');

        // Discord Notification (Immediate Announcement)
        try {
            const { sendScrimReminder } = await import('./scheduler.js');
            await sendScrimReminder(newScrim, 'NEW');
        } catch (discordErr) {
            console.error('[SCRIM DISCORD ERROR] Failed to send announcement:', discordErr);
        }

        res.json({ success: true, data: newScrim });
    } catch (error: any) {
        console.error("Error in POST /api/scrims:", error);
        res.status(500).json({ success: false, error: 'Failed to create scrim', details: IS_PROD ? undefined : error.message });
    }
});

app.put('/api/scrims/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status, requesterId } = req.body; // pending, completed, cancelled
    try {
        // Authorization check
        if (!requesterId) return res.status(401).json({ success: false, error: 'Unauthorized: Requester ID required.' });
        const requesterRows = await db.select().from(users).where(eq(users.id, Number(requesterId)));
        const requester = requesterRows[0];
        const isManager = requester?.role?.includes('manager') || requester?.role?.includes('coach');
        const isAdmin = requester?.role?.includes('admin') || requester?.role?.includes('ceo');

        if (!isAdmin && !isManager) {
            return res.status(403).json({ success: false, error: 'Access Denied: Insufficient clearance for status modification.' });
        }

        const scrimRows = await db.select().from(scrims).where(eq(scrims.id, Number(id)));
        const scrim = scrimRows[0];
        if (!scrim) return res.status(404).json({ success: false, error: 'Scrim not found.' });

        if (scrim.status !== 'pending' && !isAdmin) {
            return res.status(403).json({ success: false, error: 'Access Denied: Terminal status reached. Only high-level command can override.' });
        }

        if (isManager && !isAdmin) {
            const teamRows = await db.select().from(teams).where(eq(teams.id, scrim.teamId!));
            if (teamRows[0]?.managerId !== Number(requesterId)) {
                return res.status(403).json({ success: false, error: 'Access Denied: You do not have command authority over this unit.' });
            }
        }
        const updatedRows = await db.update(scrims).set({ status }).where(eq(scrims.id, Number(id))).returning();
        const updated = updatedRows[0];
        notifyRefresh();
        res.json({ success: true, data: updated });
    } catch (error: any) {
        console.error("Error in PUT /api/scrims/:id/status:", error);
        res.status(500).json({ success: false, error: 'Failed to update status', details: IS_PROD ? undefined : error.message });
    }
});

app.put('/api/scrims/:id', async (req, res) => {
    const { id } = req.params;
    const { date, opponent, format, maps, requesterId } = req.body;
    if (!date || !opponent || !format) return res.status(400).json({ success: false, error: 'Missing fields' });

    try {
        // Authorization check
        if (!requesterId) return res.status(401).json({ success: false, error: 'Unauthorized: Requester ID required.' });
        const requesterRows = await db.select().from(users).where(eq(users.id, Number(requesterId)));
        const requester = requesterRows[0];
        const isManager = requester?.role?.includes('manager') || requester?.role?.includes('coach');
        const isAdmin = requester?.role?.includes('admin') || requester?.role?.includes('ceo');

        if (!isAdmin && !isManager) {
            return res.status(403).json({ success: false, error: 'Access Denied: Insufficient clearance.' });
        }

        const scrimRows = await db.select().from(scrims).where(eq(scrims.id, Number(id)));
        const scrim = scrimRows[0];
        if (!scrim) return res.status(404).json({ success: false, error: 'Scrim not found.' });

        if (scrim.status !== 'pending') {
            return res.status(403).json({ success: false, error: 'Access Denied: Only pending engagements can be reassigned.' });
        }

        if (isManager && !isAdmin) {
            const teamRows = await db.select().from(teams).where(eq(teams.id, scrim.teamId!));
            if (teamRows[0]?.managerId !== Number(requesterId)) {
                return res.status(403).json({ success: false, error: 'Access Denied: Command authority required.' });
            }
        }

        const updatedRows = await db.update(scrims).set({
            date, opponent, format,
            maps: maps ? JSON.stringify(maps) : scrim.maps
        }).where(eq(scrims.id, Number(id))).returning();

        notifyRefresh();
        const updatedScrim = updatedRows[0];
        res.json({ success: true, data: updatedScrim });

        // Website Notification for Update
        const scrimTitle = "Scrim Details Updated";
        const scrimMsg = `The scrim against ${opponent} has been recalibrated. Scheduled for ${new Date(date).toLocaleString()}. Maps: ${Array.isArray(maps) ? maps.join(', ') : 'TBD'}.`;
        sendWebsiteNotification(Number(scrim.teamId), scrimTitle, scrimMsg, 'scrim');
    } catch (error: any) {
        console.error("Error in PUT /api/scrims/:id:", error);
        res.status(500).json({ success: false, error: 'Failed to update scrim', details: IS_PROD ? undefined : error.message });
    }
});

app.delete('/api/scrims/:id', async (req, res) => {
    const { id } = req.params;
    const { requesterId } = req.query;

    try {
        if (!requesterId) return res.status(401).json({ success: false, error: 'Unauthorized: Requester ID required.' });
        const requesterRows = await db.select().from(users).where(eq(users.id, Number(requesterId)));
        const requester = requesterRows[0];
        const isAdmin = requester?.role?.includes('admin') || requester?.role?.includes('ceo');
        const isManager = requester?.role?.includes('manager') || requester?.role?.includes('coach');

        if (!isAdmin && !isManager) {
            return res.status(403).json({ success: false, error: 'Access Denied: Insufficient clearance.' });
        }

        const scrimRows = await db.select().from(scrims).where(eq(scrims.id, Number(id)));
        const scrim = scrimRows[0];
        if (!scrim) return res.status(404).json({ success: false, error: 'Scrim not found.' });

        if (isManager && !isAdmin) {
            const teamRows = await db.select().from(teams).where(eq(teams.id, scrim.teamId!));
            if (teamRows[0]?.managerId !== Number(requesterId)) {
                return res.status(403).json({ success: false, error: 'Access Denied: Command authority required.' });
            }
        }

        // Delete associated stats first
        await db.delete(scrimPlayerStats).where(eq(scrimPlayerStats.scrimId, Number(id)));
        await db.delete(scrims).where(eq(scrims.id, Number(id)));

        notifyRefresh();
        res.json({ success: true, message: 'Scrim mission terminated successfully.' });
    } catch (error: any) {
        console.error("Error in DELETE /api/scrims/:id:", error);
        res.status(500).json({ success: false, error: 'Failed to delete scrim', details: IS_PROD ? undefined : error.message });
    }
});

// Tournament Routes
app.get('/api/tournaments', async (req, res) => {
    const { teamId, requesterId } = req.query;
    try {
        const cacheKey = `tournaments:${teamId ?? 'all'}:${requesterId ?? 'guest'}`;
        const cached = getCache(cacheKey);
        if (cached) return res.json({ success: true, data: cached });

        let requester = null;
        let isAdmin = false;

        // 1. Parallelize Auth and Authorization data
        const [requesterRow, teamData, isMemberRows] = await Promise.all([
            requesterId ? db.select().from(users).where(eq(users.id, Number(requesterId))) : Promise.resolve([]),
            teamId ? db.select().from(teams).where(eq(teams.id, Number(teamId))) : Promise.resolve([]),
            (teamId && requesterId) ? db.select().from(players).where(and(eq(players.teamId, Number(teamId)), eq(players.userId, Number(requesterId)))) : Promise.resolve([])
        ]);

        requester = requesterRow[0];
        isAdmin = requester?.role?.includes('admin') || requester?.role?.includes('ceo');

        let q = db.select().from(tournaments);

        if (teamId) {
            if (!isAdmin && requesterId) {
                const team = teamData[0];
                const isMember = isMemberRows.length > 0;

                if (team?.managerId !== Number(requesterId) && !isMember) {
                    setCache(cacheKey, []);
                    return res.json({ success: true, data: [] });
                }
            }
            q = q.where(eq(tournaments.teamId, Number(teamId)));
        } else if (!isAdmin && requesterId) {
            q = q.where(
                sql`EXISTS (
                    SELECT 1 FROM ${teams} 
                    WHERE ${teams.id} = ${tournaments.teamId} 
                    AND (${teams.managerId} = ${Number(requesterId)} 
                         OR EXISTS (SELECT 1 FROM ${players} WHERE ${players.teamId} = ${teams.id} AND ${players.userId} = ${Number(requesterId)}))
                )`
            );
        } else if (!isAdmin && !requesterId) {
            return res.json({ success: true, data: [] });
        }

        const data = await q;
        setCache(cacheKey, data);
        res.json({ success: true, data });
    } catch (error: any) {
        console.error("Error in GET /api/tournaments:", error);
        res.status(500).json({ success: false, error: 'Failed to fetch tournaments', details: IS_PROD ? undefined : error.message });
    }
});


app.get('/api/scrims/:id/stats', async (req, res) => {
    const scrimId = Number(req.params.id);
    const requesterId = req.query.requesterId ? Number(req.query.requesterId) : undefined;
    try {
        let requester = null;
        if (requesterId) {
            const requesterRows = await db.select().from(users).where(eq(users.id, Number(requesterId)));
            requester = requesterRows[0];
        }
        const isAdmin = requester?.role?.includes('admin') || requester?.role?.includes('ceo');

        const scrimDataRows = await db.select().from(scrims).where(eq(scrims.id, scrimId));
        const scrimData = scrimDataRows[0];
        if (!scrimData) return res.status(404).json({ success: false, error: 'Scrim not found' });

        // Authorization check if not admin
        if (!isAdmin && requesterId) {
            const teamRows = await db.select().from(teams).where(eq(teams.id, scrimData.teamId!));
            const isMember = await db.select().from(players).where(and(eq(players.teamId, scrimData.teamId!), eq(players.userId, requesterId)));
            if (teamRows[0]?.managerId !== requesterId && isMember.length === 0) {
                return res.status(403).json({ success: false, error: 'Access Denied' });
            }
        }

        const stats = await db.select({
            id: scrimPlayerStats.id,
            scrimId: scrimPlayerStats.scrimId,
            playerId: scrimPlayerStats.playerId,
            kills: scrimPlayerStats.kills,
            deaths: scrimPlayerStats.deaths,
            assists: scrimPlayerStats.assists,
            acs: scrimPlayerStats.acs,
            isWin: scrimPlayerStats.isWin,
            agent: scrimPlayerStats.agent,
            role: scrimPlayerStats.role,
            map: scrimPlayerStats.map,
            playerName: players.name,
            playerImage: players.image,
            playerRole: players.role,
            playerUserId: players.userId
        })
            .from(scrimPlayerStats)
            .leftJoin(players, eq(scrimPlayerStats.playerId, players.id))
            .where(eq(scrimPlayerStats.scrimId, scrimId));

        res.json({ success: true, data: { stats } });
    } catch (error: any) {
        console.error("Error in GET /api/scrims/:id/stats:", error);
        res.status(500).json({ success: false, error: 'Failed to fetch scrim stats' });
    }
});

app.get('/api/tournaments/:id/stats', async (req, res) => {
    const tourId = Number(req.params.id);
    const requesterId = req.query.requesterId ? Number(req.query.requesterId) : undefined;

    try {
        let requester = null;
        if (requesterId) {
            const requesterRows = await db.select().from(users).where(eq(users.id, Number(requesterId)));
            requester = requesterRows[0];
        }
        const isAdmin = requester?.role?.includes('admin') || requester?.role?.includes('ceo');

        const tourDataRows = await db.select().from(tournaments).where(eq(tournaments.id, tourId));
        const tourData = tourDataRows[0];
        if (!tourData) return res.status(404).json({ success: false, error: 'Tournament not found' });

        // Authorization check if not admin
        if (!isAdmin && requesterId) {
            const teamRows = await db.select().from(teams).where(eq(teams.id, tourData.teamId!));
            const isMember = await db.select().from(players).where(and(eq(players.teamId, tourData.teamId!), eq(players.userId, requesterId)));
            if (teamRows[0]?.managerId !== requesterId && isMember.length === 0) {
                return res.status(403).json({ success: false, error: 'Access Denied' });
            }
        }

        const stats = await db.select({
            id: tournamentPlayerStats.id,
            tournamentId: tournamentPlayerStats.tournamentId,
            playerId: tournamentPlayerStats.playerId,
            kills: tournamentPlayerStats.kills,
            deaths: tournamentPlayerStats.deaths,
            assists: tournamentPlayerStats.assists,
            acs: tournamentPlayerStats.acs,
            isWin: tournamentPlayerStats.isWin,
            agent: tournamentPlayerStats.agent,
            role: tournamentPlayerStats.role,
            map: tournamentPlayerStats.map,
            playerName: players.name,
            playerImage: players.image,
            playerRole: players.role,
            playerUserId: players.userId
        })
            .from(tournamentPlayerStats)
            .leftJoin(players, eq(tournamentPlayerStats.playerId, players.id))
            .where(eq(tournamentPlayerStats.tournamentId, tourId));

        // Filter out stats for coaches/managers just in case
        const filteredStats = stats.filter(s => !s.playerRole?.toLowerCase().includes('coach'));

        res.json({ success: true, data: { stats: filteredStats } });
    } catch (error: any) {
        console.error("Error in GET /api/tournaments/:id/stats:", error);
        res.status(500).json({ success: false, error: 'Failed to fetch tournament stats', details: IS_PROD ? undefined : error.message });
    }
});

app.post('/api/tournaments', async (req, res) => {
    const { teamId, date, name, opponent, format, maps, requesterId } = req.body;
    if (!teamId || !date || !name || !format) return res.status(400).json({ success: false, error: 'Missing fields' });

    try {
        // Authorization check
        if (!requesterId) return res.status(401).json({ success: false, error: 'Unauthorized: Requester ID required.' });
        const requesterRows = await db.select().from(users).where(eq(users.id, Number(requesterId)));
        const requester = requesterRows[0];
        const isManager = requester?.role?.includes('manager') || requester?.role?.includes('coach');
        const isAdmin = requester?.role?.includes('admin') || requester?.role?.includes('ceo');

        if (!isAdmin && !isManager) {
            return res.status(403).json({ success: false, error: 'Access Denied: Insufficient clearance for tournament logging.' });
        }

        if (isManager && !isAdmin) {
            const teamRows = await db.select().from(teams).where(eq(teams.id, Number(teamId)));
            if (teamRows[0]?.managerId !== Number(requesterId)) {
                return res.status(403).json({ success: false, error: 'Access Denied: You do not have command authority over this unit.' });
            }
        }
        const newTournamentRows = await db.insert(tournaments).values({
            teamId: Number(teamId),
            date, name, opponent, format, status: 'pending',
            maps: maps ? JSON.stringify(maps) : null
        }).returning();
        const newTournament = newTournamentRows[0];

        notifyRefresh();
        // Website Notification
        const tourneyTitle = "Tournament Entry Confirmed";
        const tourneyMsg = `The team has been entered into ${name} (${format}) scheduled for ${new Date(date).toLocaleString()}. Opponent: ${opponent || 'TBD'}.`;
        sendWebsiteNotification(Number(teamId), tourneyTitle, tourneyMsg, 'tournament');

        // Discord Notification (Immediate Announcement)
        try {
            const { sendTournamentReminder } = await import('./scheduler.js');
            await sendTournamentReminder(newTournament, 'NEW');
        } catch (discordErr) {
            console.error('[TOURNEY DISCORD ERROR] Failed to send announcement:', discordErr);
        }

        res.json({ success: true, data: newTournament });
    } catch (error: any) {
        console.error("Error in POST /api/tournaments:", error);
        res.status(500).json({ success: false, error: 'Failed to create tournament entry', details: IS_PROD ? undefined : error.message });
    }
});

app.put('/api/tournaments/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status, requesterId } = req.body;
    try {
        // Authorization check
        if (!requesterId) return res.status(401).json({ success: false, error: 'Unauthorized: Requester ID required.' });
        const requesterRows = await db.select().from(users).where(eq(users.id, Number(requesterId)));
        const requester = requesterRows[0];
        const isManager = requester?.role?.includes('manager') || requester?.role?.includes('coach');
        const isAdmin = requester?.role?.includes('admin') || requester?.role?.includes('ceo');

        if (!isAdmin && !isManager) {
            return res.status(403).json({ success: false, error: 'Access Denied: Insufficient clearance for status updates.' });
        }

        const tourRows = await db.select().from(tournaments).where(eq(tournaments.id, Number(id)));
        const tour = tourRows[0];
        if (!tour) return res.status(404).json({ success: false, error: 'Tournament not found.' });

        if (tour.status !== 'pending' && !isAdmin) {
            return res.status(403).json({ success: false, error: 'Access Denied: Terminal status reached. Only high-level command can override.' });
        }

        if (isManager && !isAdmin) {
            const teamRows = await db.select().from(teams).where(eq(teams.id, tour.teamId!));
            if (teamRows[0]?.managerId !== Number(requesterId)) {
                return res.status(403).json({ success: false, error: 'Access Denied: You do not have command authority over this unit.' });
            }
        }
        const updatedRows = await db.update(tournaments).set({ status }).where(eq(tournaments.id, Number(id))).returning();
        const updated = updatedRows[0];
        notifyRefresh();
        res.json({ success: true, data: updated });
    } catch (error: any) {
        console.error("Error in PUT /api/tournaments/:id/status:", error);
        res.status(500).json({ success: false, error: 'Failed to update tournament status', details: IS_PROD ? undefined : error.message });
    }
});

app.put('/api/tournaments/:id', async (req, res) => {
    const { id } = req.params;
    const { date, name, opponent, format, maps, requesterId } = req.body;
    if (!date || !name || !format) return res.status(400).json({ success: false, error: 'Missing fields' });

    try {
        // Authorization check
        if (!requesterId) return res.status(401).json({ success: false, error: 'Unauthorized: Requester ID required.' });
        const requesterRows = await db.select().from(users).where(eq(users.id, Number(requesterId)));
        const requester = requesterRows[0];
        const isManager = requester?.role?.includes('manager') || requester?.role?.includes('coach');
        const isAdmin = requester?.role?.includes('admin') || requester?.role?.includes('ceo');

        if (!isAdmin && !isManager) {
            return res.status(403).json({ success: false, error: 'Access Denied: Insufficient clearance.' });
        }

        const tourRows = await db.select().from(tournaments).where(eq(tournaments.id, Number(id)));
        const tour = tourRows[0];
        if (!tour) return res.status(404).json({ success: false, error: 'Tournament not found.' });

        if (tour.status !== 'pending') {
            return res.status(403).json({ success: false, error: 'Access Denied: Only pending operations can be recalibrated.' });
        }

        if (isManager && !isAdmin) {
            const teamRows = await db.select().from(teams).where(eq(teams.id, tour.teamId!));
            if (teamRows[0]?.managerId !== Number(requesterId)) {
                return res.status(403).json({ success: false, error: 'Access Denied: Command authority required.' });
            }
        }

        const updatedRows = await db.update(tournaments).set({
            date, name, opponent, format,
            maps: maps ? JSON.stringify(maps) : tour.maps
        }).where(eq(tournaments.id, Number(id))).returning();

        notifyRefresh();
        const updatedTour = updatedRows[0];
        res.json({ success: true, data: updatedTour });

        // Website Notification for Update
        const tourneyTitle = "Tournament Recalibrated";
        const tourneyMsg = `The objectives for ${name} have been updated. Scheduled for ${new Date(date).toLocaleString()}. Opponent: ${opponent || 'TBD'}.`;
        sendWebsiteNotification(Number(tour.teamId), tourneyTitle, tourneyMsg, 'tournament');
    } catch (error: any) {
        console.error("Error in PUT /api/tournaments/:id:", error);
        res.status(500).json({ success: false, error: 'Failed to update tournament', details: IS_PROD ? undefined : error.message });
    }
});

app.delete('/api/tournaments/:id', async (req, res) => {
    const { id } = req.params;
    const { requesterId } = req.query;

    try {
        if (!requesterId) return res.status(401).json({ success: false, error: 'Unauthorized: Requester ID required.' });
        const requesterRows = await db.select().from(users).where(eq(users.id, Number(requesterId)));
        const requester = requesterRows[0];
        const isAdmin = requester?.role?.includes('admin') || requester?.role?.includes('ceo');
        const isManager = requester?.role?.includes('manager') || requester?.role?.includes('coach');

        if (!isAdmin && !isManager) {
            return res.status(403).json({ success: false, error: 'Access Denied: Insufficient clearance.' });
        }

        const tourRows = await db.select().from(tournaments).where(eq(tournaments.id, Number(id)));
        const tour = tourRows[0];
        if (!tour) return res.status(404).json({ success: false, error: 'Tournament not found.' });

        if (isManager && !isAdmin) {
            const teamRows = await db.select().from(teams).where(eq(teams.id, tour.teamId!));
            if (teamRows[0]?.managerId !== Number(requesterId)) {
                return res.status(403).json({ success: false, error: 'Access Denied: Command authority required.' });
            }
        }

        // Delete associated stats first
        await db.delete(tournamentPlayerStats).where(eq(tournamentPlayerStats.tournamentId, Number(id)));
        await db.delete(tournaments).where(eq(tournaments.id, Number(id)));

        notifyRefresh();
        res.json({ success: true, message: 'Tournament operation terminated successfully.' });
    } catch (error: any) {
        console.error("Error in DELETE /api/tournaments/:id:", error);
        res.status(500).json({ success: false, error: 'Failed to delete tournament', details: IS_PROD ? undefined : error.message });
    }
});

app.post('/api/tournaments/:id/results', async (req, res) => {
    const { id } = req.params;
    const { results, playerStats, requesterId } = req.body;

    try {
        // Authorization check
        if (!requesterId) return res.status(401).json({ success: false, error: 'Unauthorized: Requester ID required.' });
        const requesterRows = await db.select().from(users).where(eq(users.id, Number(requesterId)));
        const requester = requesterRows[0];
        const isManager = requester?.role?.includes('manager') || requester?.role?.includes('coach');
        const isAdmin = requester?.role?.includes('admin') || requester?.role?.includes('ceo');

        if (!isAdmin && !isManager) {
            return res.status(403).json({ success: false, error: 'Access Denied: Insufficient clearance for data archiving.' });
        }

        const tourRows = await db.select().from(tournaments).where(eq(tournaments.id, Number(id)));
        const tour = tourRows[0];
        if (!tour) return res.status(404).json({ success: false, error: 'Tournament not found.' });

        if (isManager && !isAdmin) {
            const teamRows = await db.select().from(teams).where(eq(teams.id, tour.teamId!));
            if (teamRows[0]?.managerId !== Number(requesterId)) {
                return res.status(403).json({ success: false, error: 'Access Denied: You do not have command authority over this unit.' });
            }
        }
        await db.update(tournaments).set({
            status: 'completed',
            results: JSON.stringify(results)
        }).where(eq(tournaments.id, Number(id)));

        if (playerStats && Array.isArray(playerStats)) {
            await db.delete(tournamentPlayerStats).where(eq(tournamentPlayerStats.tournamentId, Number(id)));

            const statsToInsert: any[] = [];
            const affectedPlayerIds = new Set<number>();

            // Pre-calculate series result once
            let seriesIsWin = 0;
            if (results && Array.isArray(results)) {
                const ws = results.filter((r: any) => parseIsWin(r.score, r.isVictory) === 1).length;
                const ls = results.filter((r: any) => parseIsWin(r.score, r.isVictory) === 0).length;
                if (ws > ls) seriesIsWin = 1;
                else if (ws < ls) seriesIsWin = 0;
                else seriesIsWin = 2; // DRAW
            }

            for (const stat of playerStats) {
                if (stat.playerId) {
                    statsToInsert.push({
                        tournamentId: Number(id),
                        playerId: stat.playerId,
                        kills: Number(stat.kills),
                        deaths: Number(stat.deaths),
                        assists: Number(stat.assists),
                        acs: Number(stat.acs || 0),
                        isWin: stat.isWin !== undefined ? Number(stat.isWin) : seriesIsWin,
                        agent: stat.agent,
                        role: stat.role,
                        map: stat.map
                    });
                    affectedPlayerIds.add(stat.playerId);
                }
            }

            if (statsToInsert.length > 0) {
                // Batch insert tournament stats
                await db.insert(tournamentPlayerStats).values(statsToInsert);

                // 3. Trigger Aggregation (Optimized)
                const playerIdsArray = Array.from(affectedPlayerIds);

                // Fetch all history and current players data in parallel
                const [allScrimHistory, allTourHistory, currentPlayers] = await Promise.all([
                    db.select().from(scrimPlayerStats).where(inArray(scrimPlayerStats.playerId, playerIdsArray)),
                    db.select().from(tournamentPlayerStats).where(inArray(tournamentPlayerStats.playerId, playerIdsArray)),
                    db.select().from(players).where(inArray(players.id, playerIdsArray))
                ]);

                // Map players for easy lookup
                const playerMap = new Map(currentPlayers.map(p => [p.id, p]));

                // Update each player's aggregate stats
                for (const pId of playerIdsArray) {
                    const pScrims = allScrimHistory.filter(s => s.playerId === pId);
                    const pTours = allTourHistory.filter(s => s.playerId === pId);
                    const combined = [...pScrims, ...pTours];

                    let totalK = 0, totalD = 0, totalA = 0, totalAcs = 0, winsCount = 0;
                    combined.forEach((s: any) => {
                        totalK += s.kills;
                        totalD += s.deaths;
                        totalA += s.assists;
                        totalAcs += (s.acs || 0);
                        if (s.isWin === 1) winsCount++;
                    });

                    const totalMatches = combined.length;
                    const kda = totalD === 0 ? totalK + totalA : (totalK + totalA) / totalD;
                    const winRate = totalMatches > 0 ? (winsCount / totalMatches) * 100 : 0;
                    const avgAcs = totalMatches > 0 ? Math.round(totalAcs / totalMatches) : 0;

                    // Award XP for tournament (more than scrims)
                    // Note: Scrims award 20 XP per match in totalHistory * 20. 
                    // Tournament handler previously did (currentPlayer.xp || 0) + 50.
                    // To keep it clean and resilient, we'll use a similar logic but pre-calculate based on counts if possible.
                    // However, tournament XP seems to be a flat addition per tournament entry recorded.
                    const currentPlayer = playerMap.get(pId) as any;
                    const xpToAdd = 50;
                    const newXp = (currentPlayer?.xp || 0) + xpToAdd;
                    let newLevel = Math.floor(newXp / 100) + 1;
                    if (newLevel > 1000) newLevel = 1000;

                    await db.update(players).set({
                        kda: kda.toFixed(2),
                        winRate: `${winRate.toFixed(1)}%`,
                        acs: avgAcs.toString(),
                        xp: newXp,
                        level: newLevel
                    }).where(eq(players.id, pId));
                }
            }
        }
        notifyRefresh();
        res.json({ success: true, message: 'Tournament results saved' });
    } catch (error: any) {
        console.error("Error in POST /api/tournaments/:id/results:", error);
        res.status(500).json({ success: false, error: 'Failed to save tournament results', details: IS_PROD ? undefined : error.message });
    }
});


// AI & Results
// AI & Results
// Services are lazy-loaded within routes

app.post('/api/scrims/analyze', async (req, res) => {
    const { image, teamId } = req.body;
    if (!image || !teamId) return res.status(400).json({ success: false, error: 'Missing image or teamId' });

    try {
        console.log(`[OCR] Request received for Team ${teamId} (Lazy Loading)`);

        const { analyzeScoreboardWithOCR } = await import('./services/ocr');
        // Fetch roster for context
        const roster = await db.select().from(players).where(eq(players.teamId, Number(teamId)));

        // Analyze
        const result = await analyzeScoreboardWithOCR(image, roster);

        // Map back to IDs
        const mappedResults = result.results.map((res: any) => {
            const player = roster.find((p: any) => p.name.toLowerCase() === res.name.toLowerCase());
            return {
                ...res,
                playerId: player ? player.id : null
            };
        });

        res.json({ success: true, isVictory: result.isVictory, results: mappedResults });

    } catch (error: any) {
        console.error("Groq Analysis failed:", error);
        res.status(500).json({ success: false, error: 'Groq Analysis failed', details: IS_PROD ? undefined : error.message });
    }
});

app.post('/api/scrims/:id/results', async (req, res) => {
    const { id } = req.params;
    const { results, playerStats, requesterId } = req.body; // results: string (urls), playerStats: array

    try {
        // Authorization check
        if (!requesterId) return res.status(401).json({ success: false, error: 'Unauthorized: Requester ID required.' });
        const requesterRows = await db.select().from(users).where(eq(users.id, Number(requesterId)));
        const requester = requesterRows[0];
        const isManager = requester?.role?.includes('manager') || requester?.role?.includes('coach');
        const isAdmin = requester?.role?.includes('admin') || requester?.role?.includes('ceo');

        if (!isAdmin && !isManager) {
            return res.status(403).json({ success: false, error: 'Access Denied: Insufficient clearance for combat data archiving.' });
        }

        const scrimRows = await db.select().from(scrims).where(eq(scrims.id, Number(id)));
        const scrim = scrimRows[0];
        if (!scrim) return res.status(404).json({ success: false, error: 'Scrim not found.' });

        if (isManager && !isAdmin) {
            const teamRows = await db.select().from(teams).where(eq(teams.id, scrim.teamId!));
            if (teamRows[0]?.managerId !== Number(requesterId)) {
                return res.status(403).json({ success: false, error: 'Access Denied: You do not have command authority over this unit.' });
            }
        }
        // 1. Update Scrim
        await db.update(scrims).set({
            status: 'completed',
            results: JSON.stringify(results)
        }).where(eq(scrims.id, Number(id)));

        // 2. Insert Player Stats
        if (playerStats && Array.isArray(playerStats)) {
            // Clear old stats if re-submitting
            await db.delete(scrimPlayerStats).where(eq(scrimPlayerStats.scrimId, Number(id)));

            const statsToInsert: any[] = [];
            const affectedPlayerIds = new Set<number>();

            // Pre-calculate series result once
            let seriesIsWin = 0;
            if (results && Array.isArray(results)) {
                const ws = results.filter((r: any) => parseIsWin(r.score, r.isVictory) === 1).length;
                const ls = results.filter((r: any) => parseIsWin(r.score, r.isVictory) === 0).length;
                if (ws > ls) seriesIsWin = 1;
                else if (ws < ls) seriesIsWin = 0;
                else seriesIsWin = 2; // DRAW
            }

            for (const stat of playerStats) {
                if (stat.playerId) {
                    statsToInsert.push({
                        scrimId: Number(id),
                        playerId: stat.playerId,
                        kills: Number(stat.kills),
                        deaths: Number(stat.deaths),
                        assists: Number(stat.assists),
                        acs: Number(stat.acs || 0),
                        isWin: stat.isWin !== undefined ? Number(stat.isWin) : seriesIsWin,
                        agent: stat.agent,
                        role: stat.role,
                        map: stat.map
                    });
                    affectedPlayerIds.add(stat.playerId);
                }
            }

            if (statsToInsert.length > 0) {
                // Batch insert
                await db.insert(scrimPlayerStats).values(statsToInsert);

                // 3. Trigger Aggregation & Award XP (Optimized)
                const playerIdsArray = Array.from(affectedPlayerIds);

                // Fetch all history for all affected players in one go
                const [allScrimHistory, allTourHistory] = await Promise.all([
                    db.select().from(scrimPlayerStats).where(inArray(scrimPlayerStats.playerId, playerIdsArray)),
                    db.select().from(tournamentPlayerStats).where(inArray(tournamentPlayerStats.playerId, playerIdsArray))
                ]);

                // Update each player's aggregate stats
                for (const pId of playerIdsArray) {
                    const pScrims = allScrimHistory.filter(s => s.playerId === pId);
                    const pTours = allTourHistory.filter(s => s.playerId === pId);
                    const combined = [...pScrims, ...pTours];

                    let totalK = 0, totalD = 0, totalA = 0, totalAcs = 0, winsCount = 0;
                    combined.forEach((s: any) => {
                        totalK += s.kills;
                        totalD += s.deaths;
                        totalA += s.assists;
                        totalAcs += (s.acs || 0);
                        if (s.isWin === 1) winsCount++;
                    });

                    const totalMatches = combined.length;
                    const kda = totalD === 0 ? totalK + totalA : (totalK + totalA) / totalD;
                    const winRate = totalMatches > 0 ? (winsCount / totalMatches) * 100 : 0;
                    const avgAcs = totalMatches > 0 ? Math.round(totalAcs / totalMatches) : 0;

                    // XP Calculation (20 XP per match)
                    const totalXP = totalMatches * 20;
                    let newLevel = Math.floor(totalXP / 100) + 1;
                    if (newLevel > 1000) newLevel = 1000;

                    await db.update(players).set({
                        kda: kda.toFixed(2),
                        winRate: `${winRate.toFixed(1)}%`,
                        acs: avgAcs.toString(),
                        xp: totalXP,
                        level: newLevel
                    }).where(eq(players.id, pId));
                }
            }
        }

        notifyRefresh();
        res.json({ success: true, message: 'Results saved, stats updated, and XP awarded' });
    } catch (error: any) {
        console.error("Error in POST /api/scrims/:id/results:", error);
        res.status(500).json({ success: false, error: 'Failed to save results', details: IS_PROD ? undefined : error.message });
    }
});

// --- E-COMMERCE API ROUTES ---
app.get('/api/products', async (req, res) => {
    try {
        const allProducts = await db.select().from(products).orderBy(desc(products.createdAt));
        res.json({ success: true, data: allProducts });
    } catch (error: any) {
        console.error("GET /api/products Error:", error);
        res.status(500).json({ success: false, error: 'Failed to fetch products' });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        const { name, description, price, stock, sponsorId, imageUrl } = req.body;

        if (!name || !description || price === undefined || stock === undefined || !imageUrl) {
            return res.status(400).json({ success: false, error: 'Missing required product fields' });
        }

        const newProduct = await db.insert(products).values({
            name,
            description,
            price: Number(price),
            stock: Math.max(0, Number(stock)), // Guard against negative stock
            sponsorId: sponsorId === null ? null : Number(sponsorId),
            imageUrl
        }).returning();

        notifyRefresh();
        res.json({ success: true, data: newProduct[0] });
    } catch (error: any) {
        console.error("POST /api/products Error:", error);
        res.status(500).json({ success: false, error: 'Failed to create product', detail: error.message });
    }
});

app.put('/api/products/:id/stock', async (req, res) => {
    const { id } = req.params;
    const { stock } = req.body;
    try {
        const validatedStock = Math.max(0, Number(stock)); // Prevent negative stock
        const updatedProduct = await db.update(products).set({ stock: validatedStock }).where(eq(products.id, Number(id))).returning();
        notifyRefresh();
        res.json({ success: true, data: updatedProduct[0] });
    } catch (error: any) {
        console.error("PUT /api/products/:id/stock Error:", error);
        res.status(500).json({ success: false, error: 'Failed to update stock' });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.delete(products).where(eq(products.id, Number(id)));
        notifyRefresh();
        res.json({ success: true, message: "Product deleted" });
    } catch (error: any) {
        console.error("DELETE /api/products/:id Error:", error);
        res.status(500).json({ success: false, error: 'Failed to delete product' });
    }
});

// ── PLAYBOOK API ─────────────────────────────────────────────────────────────
app.get('/api/teams/:id/playbook', async (req, res) => {
    try {
        const teamId = Number(req.params.id);
        const rId = req.query.requesterId;
        const requesterId = (rId && rId !== 'undefined') ? Number(rId) : null;

        if (isNaN(teamId)) return res.status(400).json({ success: false, error: 'Invalid Team Identification.' });

        // Security check: If requesterId is provided and NOT management, they must be in that team
        if (requesterId && !isNaN(requesterId)) {
            const requesterRows = await db.select().from(users).where(eq(users.id, requesterId));
            const requester = requesterRows[0];
            const role = requester?.role?.toLowerCase() || '';
            const isManagement = role.includes('admin') || role.includes('ceo') || role.includes('manager') || role.includes('coach');

            if (!isManagement) {
                const playerRows = await db.select().from(players).where(and(eq(players.userId, requesterId), eq(players.teamId, teamId)));
                if (playerRows.length === 0) {
                    return res.status(403).json({ success: false, error: 'Access Denied: Team Playbook restricted to assigned operatives.' });
                }
            }
        } else if (rId && rId !== 'undefined') {
            return res.status(400).json({ success: false, error: 'Malformed requester signature.' });
        }

        const strats = await db.select().from(playbookStrategies).where(eq(playbookStrategies.teamId, teamId)).orderBy(desc(playbookStrategies.createdAt));
        res.json({ success: true, data: strats });
    } catch (error: any) {
        console.error("GET /api/teams/:id/playbook Error:", error.message);
        res.status(500).json({ success: false, error: 'Playbook retrieval failed: Protocol error.' });
    }
});

app.post('/api/teams/:id/playbook', async (req, res) => {
    try {
        const teamId = Number(req.params.id);
        const { title, game, map, side, role, content, videoUrl, authorId, requesterId } = req.body;

        if (isNaN(teamId) || !title || !content || !requesterId) {
            return res.status(400).json({ success: false, error: 'Missing required tactical parameters.' });
        }

        // Auth Check
        const requesterRows = await db.select().from(users).where(eq(users.id, Number(requesterId)));
        const requester = requesterRows[0];
        const requesterRole = requester?.role?.toLowerCase() || '';
        const isAuth = requesterRole.includes('admin') || requesterRole.includes('ceo') || requesterRole.includes('manager') || requesterRole.includes('coach');

        if (!isAuth) {
            return res.status(403).json({ success: false, error: 'Access Denied: Strategy creation requires command clearance.' });
        }

        const inserted = await db.insert(playbookStrategies).values({
            teamId,
            title,
            game,
            map,
            side,
            role,
            content,
            videoUrl,
            authorId: Number(authorId),
            createdAt: new Date(),
            updatedAt: new Date()
        }).returning();

        notifyRefresh();
        res.json({ success: true, data: inserted[0] });
    } catch (error: any) {
        console.error("POST /api/playbook Error:", error.message);
        res.status(500).json({ success: false, error: 'Strategy deployment failed.' });
    }
});

app.put('/api/playbook/:stratId', async (req, res) => {
    try {
        const stratId = Number(req.params.stratId);
        const { title, game, map, side, role, content, videoUrl, requesterId } = req.body;

        if (isNaN(stratId) || !requesterId) {
            return res.status(400).json({ success: false, error: 'Invalid tactical request.' });
        }

        // Auth Check
        const requesterRows = await db.select().from(users).where(eq(users.id, Number(requesterId)));
        const requester = requesterRows[0];
        const requesterRole = requester?.role?.toLowerCase() || '';
        const isAuth = requesterRole.includes('admin') || requesterRole.includes('ceo') || requesterRole.includes('manager') || requesterRole.includes('coach');

        if (!isAuth) {
            return res.status(403).json({ success: false, error: 'Access Denied: Modification requires command clearance.' });
        }

        const updated = await db.update(playbookStrategies).set({
            title,
            game,
            map,
            side,
            role,
            content,
            videoUrl,
            updatedAt: new Date()
        }).where(eq(playbookStrategies.id, stratId)).returning();

        if (updated.length === 0) return res.status(404).json({ success: false, error: 'Strategy not found in tactical cache.' });

        notifyRefresh();
        res.json({ success: true, data: updated[0] });
    } catch (error: any) {
        console.error("PUT /api/playbook Error:", error.message);
        res.status(500).json({ success: false, error: 'Strategy update aborted.' });
    }
});

app.delete('/api/playbook/:stratId', async (req, res) => {
    try {
        const stratId = Number(req.params.stratId);
        const { requesterId } = req.body;

        if (isNaN(stratId) || !requesterId) {
            return res.status(400).json({ success: false, error: 'Purge request rejected: Missing authorization.' });
        }

        // Auth Check
        const requesterRows = await db.select().from(users).where(eq(users.id, Number(requesterId)));
        const requester = requesterRows[0];
        const requesterRole = requester?.role?.toLowerCase() || '';
        const isAuth = requesterRole.includes('admin') || requesterRole.includes('ceo') || requesterRole.includes('manager') || requesterRole.includes('coach');

        if (!isAuth) {
            return res.status(403).json({ success: false, error: 'Access Denied: Purge sequence requires Level 4 clearance.' });
        }

        const deleted = await db.delete(playbookStrategies).where(eq(playbookStrategies.id, stratId)).returning();

        if (deleted.length === 0) return res.status(404).json({ success: false, error: 'Strategy not found.' });

        notifyRefresh();
        res.json({ success: true, message: 'Strategy purged from secure storage.' });
    } catch (error: any) {
        console.error("DELETE /api/playbook Error:", error.message);
        res.status(500).json({ success: false, error: 'Purge failure: Database lock or protocol error.' });
    }
});

app.post('/api/playbook/:stratId/copy', async (req, res) => {
    try {
        const stratId = Number(req.params.stratId);
        const { targetTeamId, requesterId } = req.body;

        if (isNaN(stratId) || !targetTeamId || isNaN(Number(requesterId))) {
            return res.status(400).json({ success: false, error: 'Duplication request rejected: Invalid tactical parameters.' });
        }

        // 1. Fetch original strat
        const originalRows = await db.select().from(playbookStrategies).where(eq(playbookStrategies.id, stratId));
        const original = originalRows[0];

        if (!original) {
            return res.status(404).json({ success: false, error: 'Source strategy not found in tactical cache.' });
        }

        // 2. Authorization
        const requesterRows = await db.select().from(users).where(eq(users.id, Number(requesterId)));
        const requester = requesterRows[0];
        const role = requester?.role?.toLowerCase() || '';
        const isAuth = role.includes('admin') || role.includes('ceo') || role.includes('manager') || role.includes('coach');

        if (!isAuth) {
            return res.status(403).json({ success: false, error: 'Access Denied: Asset duplication requires Level 3 clearance.' });
        }

        // 3. Duplicate
        const copy = await db.insert(playbookStrategies).values({
            teamId: Number(targetTeamId),
            title: `${original.title} (Copy)`,
            game: original.game,
            map: original.map,
            category: original.category,
            side: original.side,
            priority: original.priority, // Preserve priority
            role: original.role,
            content: original.content,
            notes: original.notes,
            images: original.images,
            references: original.references,
            videoUrl: original.videoUrl,
            authorId: Number(requesterId),
            createdAt: new Date(),
            updatedAt: new Date()
        }).returning();

        notifyRefresh();
        res.json({ success: true, data: copy[0], message: 'Tactical asset successfully cloned to target squad.' });
    } catch (error: any) {
        console.error("POST /api/playbook/:stratId/copy Error:", error.message);
        res.status(500).json({ success: false, error: 'Cloning protocol failure: Internal error.' });
    }
});

app.get('/api/orders', async (req, res) => {
    try {
        const userId = req.query.userId ? Number(req.query.userId) : null;
        const requesterId = req.query.requesterId ? Number(req.query.requesterId) : null;

        let query = db.select().from(orders);

        if (userId) {
            // Security Check: Only allow users to see their own orders unless they are admin/ceo
            if (requesterId && requesterId !== userId) {
                const requester = await db.select().from(users).where(eq(users.id, requesterId));
                const role = requester[0]?.role || '';
                if (!role.includes('admin') && !role.includes('ceo')) {
                    return res.status(403).json({ success: false, error: 'Access Denied: You can only view your own procurement history.' });
                }
            }
            query = query.where(eq(orders.userId, userId)) as any;
        }

        const allOrders = await query.orderBy(desc(orders.createdAt));
        res.json({ success: true, data: allOrders });
    } catch (error: any) {
        console.error("GET /api/orders Error:", error);
        res.status(500).json({ success: false, error: 'Failed to fetch orders' });
    }
});

app.post('/api/orders', async (req, res) => {
    const { userId, items, recipientName, deliveryAddress, contactNumber, paymentMethod, paymentProofUrl } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0 || !recipientName || !deliveryAddress || !contactNumber || !paymentMethod || !paymentProofUrl) {
        return res.status(400).json({ success: false, error: "Mission Intel Missing: All order details including items and payment proof are required." });
    }

    try {
        // 1. STOCK GUARD & VALIDATION
        for (const item of items) {
            const product = await db.select().from(products).where(eq(products.id, Number(item.productId)));
            if (!product[0]) {
                return res.status(404).json({ success: false, error: `Asset ID ${item.productId} not found in depot.` });
            }
            if (product[0].stock < item.quantity) {
                return res.status(400).json({
                    success: false,
                    error: `Supply Depleted: ${product[0].name} has only ${product[0].stock} units remaining. Required: ${item.quantity}.`
                });
            }
        }

        // 2. CREATE ORDERS
        const createdOrders = [];
        for (const item of items) {
            const newOrder = await db.insert(orders).values({
                userId,
                productId: item.productId,
                quantity: item.quantity,
                recipientName,
                deliveryAddress,
                contactNumber,
                paymentMethod,
                paymentProofUrl,
                status: 'For Payment Verification'
            }).returning();
            createdOrders.push(newOrder[0]);
        }

        notifyRefresh();
        res.json({ success: true, data: createdOrders });
    } catch (error: any) {
        console.error("POST /api/orders Error:", error);
        res.status(500).json({ success: false, error: 'Intersystem Error: Failed to process procurement.' });
    }
});

app.put('/api/orders/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status, requesterId } = req.body;

    try {
        // Authorization check
        if (!requesterId) return res.status(401).json({ success: false, error: 'Unauthorized: Requester ID required.' });
        const requester = await db.select().from(users).where(eq(users.id, Number(requesterId)));
        const role = requester[0]?.role || '';
        if (!role.includes('admin') && !role.includes('ceo') && !role.includes('sponsor')) {
            return res.status(403).json({ success: false, error: 'Access Denied: Insufficient permissions.' });
        }

        const orderRecord = await db.select().from(orders).where(eq(orders.id, Number(id)));
        if (!orderRecord[0]) {
            return res.status(404).json({ success: false, error: "Order not found" });
        }

        const oldStatus = orderRecord[0].status;
        const qty = orderRecord[0].quantity || 1;

        // Atomic Stock Sync
        if (oldStatus === 'For Payment Verification' && status === 'Pending') {
            const product = await db.select().from(products).where(eq(products.id, orderRecord[0].productId));
            if (product[0] && product[0].stock >= qty) {
                await db.update(products).set({ stock: sql`${products.stock} - ${qty}` }).where(eq(products.id, orderRecord[0].productId));
            } else {
                return res.status(400).json({ success: false, error: "Cannot verify payment: Depot stock insufficient." });
            }
        }

        if (status === 'Refunded' && oldStatus !== 'Refunded' && oldStatus !== 'For Payment Verification') {
            await db.update(products).set({ stock: sql`${products.stock} + ${qty}` }).where(eq(products.id, orderRecord[0].productId));
        }

        const updatedOrder = await db.update(orders).set({ status }).where(eq(orders.id, Number(id))).returning();
        notifyRefresh();
        res.json({ success: true, data: updatedOrder[0] });
    } catch (error: any) {
        console.error("PUT /api/orders/:id/status Error:", error);
        res.status(500).json({ success: false, error: 'Failed to update order status' });
    }
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(`[INTERNAL_ERROR] ${req.method} ${req.url}:`, err.stack || err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
        path: req.url,
        timestamp: new Date().toISOString()
    });
});


// --- CRON / PERIODIC TASKS ---
app.get('/api/cron/check-notifications', async (req, res) => {
    console.log('[CRON] Manual notification check triggered via protocol.');
    try {
        // In serverless, we must ensure services are loaded on demand
        const discord = await import('./discord.js');
        const scheduler = await import('./scheduler.js');

        console.log('[CRON] Initializing Discord bot...');
        discord.initDiscord();

        console.log('[CRON] Executing global notification check...');
        await scheduler.checkAllNotifications();

        res.json({ success: true, message: 'Notification audit completed successfully.' });
    } catch (error: any) {
        console.error('[CRON ERROR] Audit failed:', error);
        res.status(500).json({ success: false, error: 'Audit protocol failure', details: error.message });
    }
});

// Final Export for Vercel
export default app;

// Startup
if (process.env.NODE_ENV !== 'production' || process.env.VITE_DEV_SERVER) {
    app.listen(PORT, '0.0.0.0', async () => {
        console.log(`Server running on http://0.0.0.0:${PORT}`);

        try {
            console.log('[DEBUG] Initializing base services (Local/Dev Mode)...');
            const discord = await import('./discord.js');
            const scheduler = await import('./scheduler.js');

            initDiscord = discord.initDiscord;
            initScheduler = scheduler.initScheduler;
            checkAllNotifications = scheduler.checkAllNotifications;

            initDiscord();
            initScheduler(generateAndSendWeeklyReport);
        } catch (err) {
            console.error('[STARTUP ERROR] Service injection failed:', err);
        }
    });
} else {
    // In Vercel serverless, we still want to be able to initialize Discord when needed.
    // We don't run initScheduler('* * * * *') because cron won't persist,
    // but the /api/cron endpoint will handle the manual triggers.
    console.log('[DEBUG] Running in Vercel Serverless environment. Use /api/cron endpoints for periodic tasks.');

    // We don't call initDiscord() here to avoid slowing down EVERY cold start,
    // instead sendToDiscord() will call it on-demand via ensureDiscordReady().
    // However, if we are in a cron request, the route above handles it.
}


// --- GLOBAL ERROR HANDLER ---
// MUST be the LAST middleware registered so it catches errors from ALL routes above.
// Express identifies error handlers by their 4-argument signature (err, req, res, next).
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[CRITICAL] UNHANDLED ERROR:', err);
    res.status(500).json({
        success: false,
        error: 'An unexpected server error occurred.',
        details: IS_PROD ? 'Check server logs' : err.message
    });
});
