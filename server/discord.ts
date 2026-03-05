
import { Client, GatewayIntentBits, REST, Routes, AttachmentBuilder } from 'discord.js';
import fs from 'fs';

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// Initialize REST client
const rest = new REST({ version: '10' });

client.on('ready', () => {
    console.log(`[DISCORD] Logged in as ${client.user?.tag}`);
});

client.on('error', (err) => {
    console.error('[DISCORD CLIENT ERROR]', err);
});

// Initialize the bot (optional for REST, but good for role fetching)
export const initDiscord = () => {
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) {
        console.warn('[DISCORD] No bot token found (DISCORD_BOT_TOKEN).');
        return;
    }

    rest.setToken(token);

    if (client.ws.status === 0) return;
    if (client.ws.status === 1 || client.ws.status === 2) return;

    client.login(token).catch(err => {
        console.error('[DISCORD] Client login failed:', err);
    });
};

// Send message to configured channel using REST (stateless)
export const sendToDiscord = async (message: string, imagePath?: string | null, targetChannelId?: string) => {
    const token = process.env.DISCORD_BOT_TOKEN;
    const channelId = targetChannelId || process.env.DISCORD_SCRIM_CHANNEL_ID;

    if (!token || !channelId) {
        console.warn('[DISCORD] Missing token or channel ID. Deployment notice skipped.');
        return;
    }

    rest.setToken(token);
    console.log(`[DISCORD REST] Sending notification to channel: ${channelId}`);

    try {
        // Resolve role mentions if client is ready (best effort)
        let finalMessage = message;
        if (client.isReady()) {
            const channel = client.channels.cache.get(channelId);
            const guild = (channel as any)?.guild;
            if (guild) {
                const mentionMatches = message.match(/@([a-zA-Z0-9 :_-]+)/g);
                if (mentionMatches) {
                    const roles = await guild.roles.fetch();
                    for (const match of mentionMatches) {
                        const roleName = match.substring(1).trim();
                        const foundRole = roles.find((r: any) => r.name.toLowerCase() === roleName.toLowerCase());
                        if (foundRole) {
                            finalMessage = finalMessage.replace(match, `<@&${foundRole.id}>`);
                        }
                    }
                }
            }
        }

        const body: any = { content: finalMessage };
        const files: { name: string, data: Buffer | string }[] = [];

        if (imagePath && fs.existsSync(imagePath)) {
            const data = fs.readFileSync(imagePath);
            const name = imagePath.split(/[\\/]/).pop() || 'attachment.png';
            files.push({ name, data });
        }

        // Use standard POST request via REST - no "ready" check needed
        await rest.post(Routes.channelMessages(channelId), {
            body,
            files: files.length > 0 ? files : undefined
        });

        console.log(`[DISCORD REST] Message dispatched successfully to ${channelId}`);
    } catch (error: any) {
        console.error(`[DISCORD REST ERROR] Dispatch failed:`, error.message);
    }
};
