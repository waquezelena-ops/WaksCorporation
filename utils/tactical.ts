export const calculateKDA = (kills: number, assists: number, deaths: number): string => {
    return ((kills + (assists || 0)) / (deaths || 1)).toFixed(2);
};

export const getKDAColor = (kda: string | number): string => {
    const val = typeof kda === 'string' ? parseFloat(kda) : kda;
    if (val >= 1.5) return 'text-emerald-500';
    if (val >= 1.2) return 'text-emerald-400';
    if (val >= 1.0) return 'text-white';
    return 'text-red-400';
};

export const getAgentImage = (agentName: string): string => {
    const normalized = (agentName || 'Unknown').replace('/', '_');
    // Veto specifically might use .webp or .png, fallback logic handled in component usually
    // but we can provide the base path here
    if (normalized === 'Veto') return `/assets/agents/${normalized}.webp`;
    return `/assets/agents/${normalized}.png`;
};

export const getTacticalRole = (roleStr: string): string => {
    if (!roleStr) return 'Operative';
    const roles = roleStr.split(',').map(r => r.trim());
    const tacticalRoles = ['Sentinel', 'Duelist', 'Initiator', 'Controller', 'Entry', 'Support', 'Sniper', 'IGL', 'Lurker', 'Rifler', 'Fragger', 'Lead', 'Scout', 'Anchor', 'Jungler', 'Roamer', 'Mid Lane', 'Gold Lane', 'EXP Lane', 'Tank', 'Carry', 'ADC'];
    const found = roles.find(r => tacticalRoles.some(tr => tr.toLowerCase() === r.toLowerCase()));
    return found || roles[0] || 'Operative';
};

export const getRankBadge = (level: number | undefined | null, roleStr?: string): string => {
    if (!level) return 'LVL 1';

    // Core/Leadership Levels from server/index.ts
    if (level >= 1000000000000) return 'CORE';
    if (level >= 1000000000) return 'CEO';
    if (level >= 1000000) return 'COACH';

    // Fallback to role string check if level is not a magic number
    if (roleStr) {
        const roles = roleStr.toLowerCase();
        if (roles.includes('admin') || roles.includes('ceo')) return 'CORE';
        if (roles.includes('coach') || roles.includes('manager')) return 'COACH';
    }

    return `LVL ${level}`;
};
export const parseMatchResult = (score: any, isVictory?: boolean): number => {
    // 1=Win, 0=Loss, 2=Draw
    const isWinStr = typeof score === 'string' && score.toUpperCase() === 'WIN';
    if (isVictory === true || isWinStr) return 1;

    const isLossStr = typeof score === 'string' && score.toUpperCase() === 'LOSS';
    if (isVictory === false || isLossStr) return 0;

    if (typeof score === 'string' && score.includes('-')) {
        const [s1, s2] = score.split('-').map(str => parseInt(str.trim()));
        if (!isNaN(s1) && !isNaN(s2)) {
            if (s1 > s2) return 1;
            if (s1 < s2) return 0;
            return 2; // DRAW
        }
    }

    if (isVictory === true) return 1;
    if (isVictory === false) return 0;
    return 2;
};
