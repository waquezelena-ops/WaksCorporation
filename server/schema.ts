import { pgTable, text, integer, serial, timestamp, boolean, index } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    username: text('username').notNull().unique(),
    password: text('password').notNull(),
    email: text('email').notNull().unique(),
    fullname: text('fullname').notNull(),
    googleId: text('google_id').unique(),
    avatar: text('avatar'),
    role: text('role').default('member'),
    bio: text('bio'),
    gamesPlayed: text('games_played'),
    achievements: text('achievements'),
    birthday: text('birthday'),
    createdAt: timestamp('created_at').defaultNow(),
    ign: text('ign'),
});

export const scrims = pgTable('scrims', {
    id: serial('id').primaryKey(),
    teamId: integer('team_id').references(() => teams.id),
    date: text('date').notNull(),
    opponent: text('opponent').notNull(),
    format: text('format').notNull(),
    status: text('status').default('pending'),
    results: text('results'),
    maps: text('maps'),
}, (t) => ({
    teamIdIdx: index('scrims_team_id_idx').on(t.teamId),
    statusIdx: index('scrims_status_idx').on(t.status),
}));

export const scrimPlayerStats = pgTable('scrim_player_stats', {
    id: serial('id').primaryKey(),
    scrimId: integer('scrim_id').references(() => scrims.id),
    playerId: integer('player_id').references(() => players.id),
    kills: integer('kills').default(0),
    deaths: integer('deaths').default(0),
    assists: integer('assists').default(0),
    acs: integer('acs').default(0),
    isWin: integer('is_win').default(0),
    agent: text('agent'),
    role: text('role'),
    map: text('map'),
}, (t) => ({
    scrimIdIdx: index('scrim_player_stats_scrim_id_idx').on(t.scrimId),
    playerIdIdx: index('scrim_player_stats_player_id_idx').on(t.playerId),
}));

export const achievements = pgTable('achievements', {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    date: text('date').notNull(),
    description: text('description').notNull(),
    image: text('image'),
    placement: text('placement'),
    game: text('game'),
});

export const events = pgTable('events', {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    date: text('date').notNull(),
    location: text('location'),
    description: text('description'),
    status: text('status').default('upcoming'),
    image: text('image'),
}, (t) => ({
    statusIdx: index('events_status_idx').on(t.status),
}));

export const sponsors = pgTable('sponsors', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    tier: text('tier').notNull(),
    logo: text('logo').notNull(),
    description: text('description'),
    website: text('website'),
    userId: integer('user_id').references(() => users.id),
    qrEWallet: text('qr_ewallet'),
    qrBank: text('qr_bank'),
}, (t) => ({
    userIdIdx: index('sponsors_user_id_idx').on(t.userId),
}));

export const siteSettings = pgTable('site_settings', {
    id: serial('id').primaryKey(),
    waksQrEWallet: text('waks_qr_ewallet'),
    waksQrBank: text('waks_qr_bank'),
});

export const teams = pgTable('teams', {
    id: serial('id').primaryKey(),
    name: text('name').notNull().unique(),
    managerId: integer('manager_id').references(() => users.id),
    game: text('game').notNull(),
    logo: text('logo'),
    description: text('description'),
}, (t) => ({
    managerIdIdx: index('teams_manager_id_idx').on(t.managerId),
    gameIdx: index('teams_game_idx').on(t.game),
}));

export const players = pgTable('players', {
    id: serial('id').primaryKey(),
    teamId: integer('team_id').references(() => teams.id),
    userId: integer('user_id').references(() => users.id),
    name: text('name').notNull(),
    role: text('role').notNull(),
    kda: text('kda'),
    winRate: text('win_rate'),
    acs: text('acs'),
    image: text('image'),
    level: integer('level').default(1),
    xp: integer('xp').default(0),
    isActive: boolean('is_active').default(true),
}, (t) => ({
    teamIdIdx: index('players_team_id_idx').on(t.teamId),
    userIdIdx: index('players_user_id_idx').on(t.userId),
}));

export const eventNotifications = pgTable('event_notifications', {
    id: serial('id').primaryKey(),
    eventId: integer('event_id').references(() => events.id),
    type: text('type').notNull(),
    sentAt: timestamp('sent_at').defaultNow(),
}, (t) => ({
    eventIdIdx: index('event_notifications_event_id_idx').on(t.eventId),
}));

export const scrimNotifications = pgTable('scrim_notifications', {
    id: serial('id').primaryKey(),
    scrimId: integer('scrim_id').references(() => scrims.id),
    type: text('type').notNull(),
    sentAt: timestamp('sent_at').defaultNow(),
}, (t) => ({
    scrimIdIdx: index('scrim_notifications_scrim_id_idx').on(t.scrimId),
}));

export const tournamentNotifications = pgTable('tournament_notifications', {
    id: serial('id').primaryKey(),
    tournamentId: integer('tournament_id').references(() => tournaments.id),
    type: text('type').notNull(),
    sentAt: timestamp('sent_at').defaultNow(),
}, (t) => ({
    tournamentIdIdx: index('tournament_notifications_tournament_id_idx').on(t.tournamentId),
}));

export const tournaments = pgTable('tournaments', {
    id: serial('id').primaryKey(),
    teamId: integer('team_id').references(() => teams.id),
    date: text('date').notNull(),
    name: text('name').notNull(),
    opponent: text('opponent'),
    format: text('format').notNull(),
    status: text('status').default('pending'),
    results: text('results'),
    maps: text('maps'),
}, (t) => ({
    teamIdIdx: index('tournaments_team_id_idx').on(t.teamId),
    statusIdx: index('tournaments_status_idx').on(t.status),
}));

export const tournamentPlayerStats = pgTable('tournament_player_stats', {
    id: serial('id').primaryKey(),
    tournamentId: integer('tournament_id').references(() => tournaments.id),
    playerId: integer('player_id').references(() => players.id),
    kills: integer('kills').default(0),
    deaths: integer('deaths').default(0),
    assists: integer('assists').default(0),
    acs: integer('acs').default(0),
    isWin: integer('is_win').default(0),
    agent: text('agent'),
    role: text('role'),
    map: text('map'),
}, (t) => ({
    tournamentIdIdx: index('tournament_player_stats_tournament_id_idx').on(t.tournamentId),
    playerIdIdx: index('tournament_player_stats_player_id_idx').on(t.playerId),
}));

export const weeklyReports = pgTable('weekly_reports', {
    id: serial('id').primaryKey(),
    weekStart: text('week_start').notNull(),
    weekEnd: text('week_end').notNull(),
    generatedAt: text('generated_at').notNull(),
    reportData: text('report_data').notNull(),
    pdfPath: text('pdf_path'),
}, (t) => ({
    weekStartIdx: index('weekly_reports_week_start_idx').on(t.weekStart),
}));

export const rosterQuotas = pgTable('roster_quotas', {
    id: serial('id').primaryKey(),
    teamId: integer('team_id').references(() => teams.id).unique(),
    baseAimKills: integer('base_aim_kills').default(0),
    baseGrindRG: integer('base_grind_rg').default(0),
    reducedAimKills: integer('reduced_aim_kills').default(0),
    reducedGrindRG: integer('reduced_grind_rg').default(0),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const playerQuotaProgress = pgTable('player_quota_progress', {
    id: serial('id').primaryKey(),
    playerId: integer('player_id').references(() => players.id),
    weekStart: text('week_start').notNull(),
    aimStatus: text('aim_status').default('pending'),
    grindStatus: text('grind_status').default('pending'),
    totalAimKills: integer('total_aim_kills').default(0),
    totalGrindRG: integer('total_grind_rg').default(0),
    aimProof: text('aim_proof'),
    grindProof: text('grind_proof'),
    assignedBaseAim: integer('assigned_base_aim').default(0),
    assignedBaseGrind: integer('assigned_base_grind').default(0),
    punishmentKills: integer('punishment_kills').default(0),
    punishmentRG: integer('punishment_rg').default(0),
    carryOverKills: integer('carry_over_kills').default(0),
    carryOverRG: integer('carry_over_rg').default(0),
    isCustomQuotaApplied: boolean('is_custom_quota_applied').default(false),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => ({
    playerIdIdx: index('player_quota_progress_player_id_idx').on(t.playerId),
    weekStartIdx: index('player_quota_progress_week_start_idx').on(t.weekStart),
    playerWeekIdx: index('player_quota_progress_player_week_idx').on(t.playerId, t.weekStart),
}));

export const products = pgTable('products', {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    price: integer('price').notNull(),
    stock: integer('stock').notNull().default(0),
    sponsorId: integer('sponsor_id').references(() => sponsors.id),
    imageUrl: text('image_url').notNull(),
    status: text('status').default('active'),
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    statusIdx: index('products_status_idx').on(t.status),
}));

export const orders = pgTable('orders', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id),
    productId: integer('product_id').references(() => products.id),
    quantity: integer('quantity').notNull().default(1),
    recipientName: text('recipient_name').notNull(),
    deliveryAddress: text('delivery_address').notNull(),
    contactNumber: text('contact_number').notNull(),
    paymentMethod: text('payment_method').notNull(),
    paymentProofUrl: text('payment_proof_url'),
    status: text('status').default('For Payment Verification'),
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    userIdIdx: index('orders_user_id_idx').on(t.userId),
    productIdIdx: index('orders_product_id_idx').on(t.productId),
    statusIdx: index('orders_status_idx').on(t.status),
}));

export const playbookStrategies = pgTable('playbook_strategies', {
    id: serial('id').primaryKey(),
    teamId: integer('team_id').references(() => teams.id),
    title: text('title').notNull(),
    game: text('game'),
    map: text('map'),
    category: text('category'),
    side: text('side'),
    priority: text('priority').default('medium'),
    role: text('role'),
    content: text('content'),
    notes: text('notes'),
    images: text('images'),
    references: text('references'),
    videoUrl: text('video_url'),
    authorId: integer('author_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
}, (t) => ({
    teamIdIdx: index('playbook_strategies_team_id_idx').on(t.teamId),
    gameIdx: index('playbook_strategies_game_idx').on(t.game),
}));

export const notifications = pgTable('notifications', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id).notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    type: text('type').notNull(),
    isRead: boolean('is_read').default(false),
    createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
    userIdIdx: index('notifications_user_id_idx').on(t.userId),
    isReadIdx: index('notifications_is_read_idx').on(t.isRead),
    userReadIdx: index('notifications_user_read_idx').on(t.userId, t.isRead),
}));
