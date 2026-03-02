import cron from 'node-cron';
import { db } from './db.js';
import { events, eventNotifications, scrims, teams, scrimNotifications, tournaments, tournamentNotifications } from './schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { sendToDiscord } from './discord.js';
import fs from 'fs';

// NOTIFICATION_INTERVALS removed - we use custom logic in check loop

export const checkAllNotifications = async () => {
    console.log('[SCHEDULER] Checking for upcoming events and scrims...');
    try {
        const now = new Date().getTime();

        // --- Pre-fetch ALL existing notification records to avoid N+1 queries ---
        const [allEventNotifs, allScrimNotifs, allTourneyNotifs] = await Promise.all([
            db.select().from(eventNotifications),
            db.select().from(scrimNotifications),
            db.select().from(tournamentNotifications),
        ]);
        // Build lookup sets: "eventId:type" → true  (O(1) existence check)
        const eventNotifSet = new Set(allEventNotifs.map(n => `${n.eventId}:${n.type}`));
        const scrimNotifSet = new Set(allScrimNotifs.map(n => `${n.scrimId}:${n.type}`));
        const tourneyNotifSet = new Set(allTourneyNotifs.map(n => `${n.tournamentId}:${n.type}`));

        // --- 1. Event Notifications ---
        const allEvents = await db.select().from(events).where(inArray(events.status, ['upcoming', 'on-going']));
        for (const event of allEvents) {
            const eventTime = new Date(event.date).getTime();
            const timeDiff = eventTime - now;

            const ONE_HOUR = 60 * 60 * 1000;
            const ONE_DAY = 24 * 60 * 60 * 1000;
            const TWENTY_THREE_HOURS = 23 * 60 * 60 * 1000;
            const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
            const SEVENTY_ONE_HOURS = 71 * 60 * 60 * 1000;

            if (event.status === 'upcoming' && timeDiff > 0) {
                const FIVE_HOURS = 5 * 60 * 60 * 1000;
                const FOUR_HOURS_50M = 4 * 60 * 60 * 1000 + 50 * 60 * 1000;
                const FIVE_HOURS_10M = 5 * 60 * 60 * 1000 + 10 * 60 * 1000;

                // 1h Window
                if (timeDiff <= ONE_HOUR) {
                    if (!eventNotifSet.has(`${event.id}:1h`)) {
                        const minutes = Math.ceil(timeDiff / 60000);
                        await sendAIEventNotification(event, `${minutes} Minutes`);
                        await db.insert(eventNotifications).values({ eventId: event.id, type: '1h', sentAt: new Date() });
                        eventNotifSet.add(`${event.id}:1h`);
                    }
                }
                // 5h Window
                else if (timeDiff <= FIVE_HOURS_10M && timeDiff > FOUR_HOURS_50M) {
                    if (!eventNotifSet.has(`${event.id}:5h`)) {
                        await sendAIEventNotification(event, '5 Hours');
                        await db.insert(eventNotifications).values({ eventId: event.id, type: '5h', sentAt: new Date() });
                        eventNotifSet.add(`${event.id}:5h`);
                    }
                }
                // 1d Window
                else if (timeDiff <= ONE_DAY && timeDiff > TWENTY_THREE_HOURS) {
                    if (!eventNotifSet.has(`${event.id}:1d`)) {
                        await sendAIEventNotification(event, '1 Day');
                        await db.insert(eventNotifications).values({ eventId: event.id, type: '1d', sentAt: new Date() });
                        eventNotifSet.add(`${event.id}:1d`);
                    }
                }
                // 3d Window
                else if (timeDiff <= THREE_DAYS && timeDiff > SEVENTY_ONE_HOURS) {
                    if (!eventNotifSet.has(`${event.id}:3d`)) {
                        await sendAIEventNotification(event, '3 Days');
                        await db.insert(eventNotifications).values({ eventId: event.id, type: '3d', sentAt: new Date() });
                        eventNotifSet.add(`${event.id}:3d`);
                    }
                }
                // Created Mid-range catch-all
                else if (timeDiff <= TWENTY_THREE_HOURS && timeDiff > FIVE_HOURS_10M) {
                    if (!eventNotifSet.has(`${event.id}:created_mid`) && !eventNotifSet.has(`${event.id}:1h`) && !eventNotifSet.has(`${event.id}:5h`)) {
                        const hours = Math.ceil(timeDiff / ONE_HOUR);
                        await sendAIEventNotification(event, `${hours} Hours`);
                        await db.insert(eventNotifications).values({ eventId: event.id, type: 'created_mid', sentAt: new Date() });
                        eventNotifSet.add(`${event.id}:created_mid`);
                    }
                }
            }

            if (timeDiff < -(7 * ONE_HOUR)) {
                await db.update(events).set({ status: 'completed' }).where(eq(events.id, event.id));
            } else if (event.status === 'upcoming' && timeDiff <= 0) {
                await db.update(events).set({ status: 'on-going' }).where(eq(events.id, event.id));
            }
        }

        // --- 2. Scrim Reminders (30m and 10m) ---
        const upcomingScrims = await db.select().from(scrims).where(eq(scrims.status, 'pending'));
        for (const scrim of upcomingScrims) {
            const scrimTime = new Date(scrim.date).getTime();
            const timeDiff = scrimTime - now;

            const TEN_MINUTES = 10 * 60 * 1000;
            const THIRTY_MINUTES = 30 * 60 * 1000;
            const ELEVEN_MINUTES = 11 * 60 * 1000;

            if (timeDiff <= TEN_MINUTES && timeDiff > 0) {
                if (!scrimNotifSet.has(`${scrim.id}:10m`)) {
                    await sendScrimReminder(scrim, '10 Minutes');
                    await db.insert(scrimNotifications).values({ scrimId: scrim.id, type: '10m', sentAt: new Date() });
                    scrimNotifSet.add(`${scrim.id}:10m`);
                }
            } else if (timeDiff <= THIRTY_MINUTES && timeDiff > ELEVEN_MINUTES) {
                if (!scrimNotifSet.has(`${scrim.id}:30m`)) {
                    await sendScrimReminder(scrim, '30 Minutes');
                    await db.insert(scrimNotifications).values({ scrimId: scrim.id, type: '30m', sentAt: new Date() });
                    scrimNotifSet.add(`${scrim.id}:30m`);
                }
            }
        }

        // --- 3. Tournament Reminders (1d, 30m, and 10m) ---
        const upcomingTournaments = await db.select().from(tournaments).where(eq(tournaments.status, 'pending'));
        for (const tourney of upcomingTournaments) {
            const tourneyTime = new Date(tourney.date).getTime();
            const timeDiff = tourneyTime - now;

            const TEN_MINUTES = 10 * 60 * 1000;
            const THIRTY_MINUTES = 30 * 60 * 1000;
            const ONE_DAY = 24 * 60 * 60 * 1000;
            const ELEVEN_MINUTES = 11 * 60 * 1000;
            const TWENTY_THREE_HOURS = 23 * 60 * 60 * 1000;

            if (timeDiff <= TEN_MINUTES && timeDiff > 0) {
                if (!tourneyNotifSet.has(`${tourney.id}:10m`)) {
                    await sendTournamentReminder(tourney, '10 Minutes');
                    await db.insert(tournamentNotifications).values({ tournamentId: tourney.id, type: '10m', sentAt: new Date() });
                    tourneyNotifSet.add(`${tourney.id}:10m`);
                }
            } else if (timeDiff <= THIRTY_MINUTES && timeDiff > ELEVEN_MINUTES) {
                if (!tourneyNotifSet.has(`${tourney.id}:30m`)) {
                    await sendTournamentReminder(tourney, '30 Minutes');
                    await db.insert(tournamentNotifications).values({ tournamentId: tourney.id, type: '30m', sentAt: new Date() });
                    tourneyNotifSet.add(`${tourney.id}:30m`);
                }
            } else if (timeDiff <= ONE_DAY && timeDiff > TWENTY_THREE_HOURS) {
                if (!tourneyNotifSet.has(`${tourney.id}:1d`)) {
                    await sendTournamentReminder(tourney, '1 Day');
                    await db.insert(tournamentNotifications).values({ tournamentId: tourney.id, type: '1d', sentAt: new Date() });
                    tourneyNotifSet.add(`${tourney.id}:1d`);
                }
            }
        }

    } catch (error) {
        console.error('[SCHEDULER] Error in check loop:', error);
    }
};


export const initScheduler = (onWeeklyReportTrigger?: () => Promise<any>) => {
    // Run notification check every minute
    cron.schedule('* * * * *', async () => {
        await checkAllNotifications();
    });

    // Run Weekly Telemetry Push every Saturday at 23:59
    if (onWeeklyReportTrigger) {
        cron.schedule('59 23 * * 6', async () => {
            console.log('[SCHEDULER] Triggering automated Saturday Weekly Performance Edict...');
            try {
                await onWeeklyReportTrigger();
                console.log('[SCHEDULER] Automated weekly report sent successfully.');
            } catch (err) {
                console.error('[SCHEDULER ERROR] Failed to send automated weekly report:', err);
            }
        });
    }

    console.log('[SCHEDULER] Event, Scrim, and Weekly Report schedulers active.');
};

async function sendScrimReminder(scrim: any, timeText: string) {
    try {
        const families = await db.select().from(teams).where(eq(teams.id, Number(scrim.teamId)));
        const team = families[0];
        const teamName = team?.name || 'Unknown Squad';

        const discordMsg = `🚨 **SCRIM DEPLOYMENT IMMINENT** 🚨\n\n` +
            `**Squad Mention:** @${teamName}\n` +
            `**Countdown:** Starting in **${timeText}**\n` +
            `**Opponent:** ${scrim.opponent}\n` +
            `**Protocol:** ${scrim.format}\n\n` +
            `*All personnel report to stations immediately. Prepare for theater engagement.*`;

        fs.appendFile('discord_audit.log', `[${new Date().toISOString()}] TO: ${process.env.DISCORD_SCRIM_CHANNEL_ID} (REMINDER)\n${discordMsg}\n${'='.repeat(50)}\n`, err => { if (err) console.error('[AUDIT LOG] Write failed:', err); });
        await sendToDiscord(discordMsg, null, process.env.DISCORD_SCRIM_CHANNEL_ID);
    } catch (err) {
        console.error('[SCHEDULER ERROR] Failed to send scrim reminder:', err);
    }
}

async function sendTournamentReminder(tourney: any, timeText: string) {
    try {
        const families = await db.select().from(teams).where(eq(teams.id, Number(tourney.teamId)));
        const team = families[0];
        const teamName = team?.name || 'Unknown Squad';

        const discordMsg = `🏆 **TOURNAMENT OPERATION IMMINENT** 🏆\n\n` +
            `**Unit Mention:** @${teamName}\n` +
            `**Countdown:** Starting in **${timeText}**\n` +
            `**Tournament:** ${tourney.name}\n` +
            `**Protocol:** ${tourney.format}\n\n` +
            `*All operatives report for final briefing. Glory to the Corporation.*`;

        fs.appendFile('discord_audit.log', `[${new Date().toISOString()}] TO: ${process.env.DISCORD_TOURNAMENT_CHANNEL_ID} (REMINDER)\n${discordMsg}\n${'='.repeat(50)}\n`, err => { if (err) console.error('[AUDIT LOG] Write failed:', err); });
        await sendToDiscord(discordMsg, null, process.env.DISCORD_TOURNAMENT_CHANNEL_ID);
    } catch (err) {
        console.error('[SCHEDULER ERROR] Failed to send tournament reminder:', err);
    }
}

export async function sendAIEventNotification(event: any, timeLabel: string) {
    // If no API key, skip AI generation and send the fallback directly (no throw needed)
    if (!process.env.GEMINI_API_KEY) {
        console.warn('[SCHEDULER] Missing GEMINI_API_KEY — sending plain fallback notification.');
        const fallbackMsg = `🚨 **UPCOMING EVENT** 🚨\n**${event.title}** is starting in ${timeLabel}!\n${event.description || ''}\n@everyone`;
        fs.appendFile('discord_audit.log', `[${new Date().toISOString()}] TO: ${process.env.DISCORD_EVENT_CHANNEL_ID} (FALLBACK-NO-KEY)\n${fallbackMsg}\n${'='.repeat(50)}\n`, err => { if (err) console.error('[AUDIT LOG] Write failed:', err); });
        await sendToDiscord(fallbackMsg, event.image, process.env.DISCORD_EVENT_CHANNEL_ID);
        return;
    }

    let timeText = timeLabel;
    if (timeLabel === '3d') timeText = '3 Days';
    if (timeLabel === '1d') timeText = '1 Day';
    if (timeLabel === '1h') timeText = '1 Hour';
    // "5 Hours" or "30 Minutes" comes through as-is

    const prompt = `
        You are the hype announcer for WC Esports (Waks Corporation).
        Write a short, high-energy Discord notification for an upcoming event.
        
        Event Details:
        - Title: ${event.title}
        - Description: ${event.description || 'N/A'}
        - Location: ${event.location || 'N/A'}
        - Time Remaining: ${timeText} EXACTLY.
        
        Instructions:
        - Format the message as a structured Discord announcement using Markdown.
        - **Headline**: Use a bold, emoji-prefixed headline (e.g., 🎮 **TITLE**).
        - **Description**: A clear, engaging paragraph.
        - **Details/Requirements**: Use bullet points (• or -) if the event description implies a list (e.g., rules, requirements, lineup).
        - **Key Info**: distinct sections for Location/Time if relevant.
        - **Action**: A clear "Interested?" or "Join now" call to action.
        - **Footer**: Ends with relevant hashtags and @everyone.
        - Do NOT limit length to 2 sentences. Make it look professional and complete (like a recruitment or tournament post).
        - Output ONLY the message content.
    `;

    try {
        const { GoogleGenAI } = await import('@google/genai');
        const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        console.log('[SCHEDULER] Generating content with Gemini... (Lazy Loading)');
        const response = await genAI.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: prompt
        });

        const message = response.text;
        console.log(`[SCHEDULER] Generated message (${message?.length} chars):\n${message}`);

        if (message) {
            fs.appendFile('discord_audit.log', `[${new Date().toISOString()}] TO: ${process.env.DISCORD_EVENT_CHANNEL_ID}\n${message}\n${'='.repeat(50)}\n`, err => { if (err) console.error('[AUDIT LOG] Write failed:', err); });
            await sendToDiscord(message, event.image, process.env.DISCORD_EVENT_CHANNEL_ID);
        } else {
            console.error('[SCHEDULER] Error: Generated message is empty. Sending fallback.');
            throw new Error('Empty AI response');
        }
    } catch (error: any) {
        console.error(`[SCHEDULER ERROR] AI generation failed: ${error.message}. Sending plain fallback.`);
        const fallbackMsg = `🚨 **UPCOMING EVENT** 🚨\n**${event.title}** is starting in ${timeLabel}!\n${event.description || ''}\n@everyone`;
        fs.appendFile('discord_audit.log', `[${new Date().toISOString()}] TO: ${process.env.DISCORD_EVENT_CHANNEL_ID} (FALLBACK)\n${fallbackMsg}\n${'='.repeat(50)}\n`, err => { if (err) console.error('[AUDIT LOG] Write failed:', err); });
        await sendToDiscord(fallbackMsg, event.image, process.env.DISCORD_EVENT_CHANNEL_ID);
    }
}

