const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const scraper = require('./scraper');
const analyzer = require('./analyzer');

const DATA_DIR = path.join(__dirname, '../data');
const COMMUNITY_PATH = path.join(DATA_DIR, 'community.json');
const DAILY_PICK_LIMIT = 20;
const DAILY_PARLAY_LIMIT = 5;
const TOURNAMENT_SCORING_MODES = new Set(['classic', 'knockout', 'parlayOnly']);
const TOURNAMENT_PAYOUT_MODES = new Set(['fixedTop3', 'top20']);

// Sync Status State
let syncStatus = {
    isSyncing: false,
    currentAction: 'Idle',
    lastSyncTime: null,
    jobType: null,
    queuedManual: 0
};

let manualQueue = [];
let isProcessingManualQueue = false;

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

function formatDateUTC(dateObj) {
    return dateObj.toISOString().split('T')[0];
}

function startOfTodayUTC() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDaysUTC(dateObj, days) {
    const d = new Date(dateObj);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
}

async function isValidJsonFile(filePath) {
    if (!fs.existsSync(filePath)) return false;
    try {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        JSON.parse(content);
        return true;
    } catch {
        return false;
    }
}

function extractDateFromDatedFilename(filename, prefix) {
    if (!filename.startsWith(prefix)) return null;
    if (!filename.endsWith('.json')) return null;
    const datePart = filename.slice(prefix.length, -'.json'.length);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
    return datePart;
}

async function cleanupDataOutsideWindow(keepDatesSet) {
    const files = await fs.promises.readdir(DATA_DIR);
    const deletions = [];

    for (const filename of files) {
        const matchDate = extractDateFromDatedFilename(filename, 'matches_');
        const standingsDate = extractDateFromDatedFilename(filename, 'standings_');
        const date = matchDate || standingsDate;

        if (!date) continue;
        if (keepDatesSet.has(date)) continue;

        deletions.push(fs.promises.unlink(path.join(DATA_DIR, filename)));
    }

    if (deletions.length > 0) {
        await Promise.all(deletions);
    }

    return deletions.length;
}

async function readJsonFile(filePath, fallbackValue) {
    try {
        if (!fs.existsSync(filePath)) return fallbackValue;
        const content = await fs.promises.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    } catch {
        return fallbackValue;
    }
}

async function writeJsonFileAtomic(filePath, data) {
    const tmpPath = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    const json = JSON.stringify(data, null, 2);
    await fs.promises.writeFile(tmpPath, json);
    if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
    }
    await fs.promises.rename(tmpPath, filePath);
}

function sha256(input) {
    return crypto.createHash('sha256').update(input).digest('hex');
}

function randomId(prefix) {
    return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function randomKey() {
    return crypto.randomBytes(24).toString('hex');
}

function getWeekStartUTC(dateObj) {
    const d = new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate()));
    const day = d.getUTCDay();
    const diff = (day + 6) % 7;
    d.setUTCDate(d.getUTCDate() - diff);
    return d;
}

function parseScore(text) {
    if (!text || typeof text !== 'string') return null;
    const normalized = text.replace(/\s+/g, ' ').trim();
    const m = normalized.match(/(\d+)\s*[:\-]\s*(\d+)/);
    if (!m) return null;
    const home = Number(m[1]);
    const away = Number(m[2]);
    if (Number.isNaN(home) || Number.isNaN(away)) return null;
    return { home, away };
}

function computeMarketResult(market, score) {
    if (!score) return null;
    if (market === 'GG') {
        return score.home > 0 && score.away > 0;
    }
    if (market === 'O25') {
        return score.home + score.away >= 3;
    }
    return null;
}

async function loadCommunityState() {
    const base = { version: 1, users: {}, picks: {}, parlays: {}, tournaments: {} };
    const state = await readJsonFile(COMMUNITY_PATH, base);
    if (!state || typeof state !== 'object') return base;
    if (!state.users) state.users = {};
    if (!state.picks) state.picks = {};
    if (!state.parlays) state.parlays = {};
    if (!state.tournaments) state.tournaments = {};
    if (!state.version) state.version = 1;
    return state;
}

async function saveCommunityState(state) {
    await writeJsonFileAtomic(COMMUNITY_PATH, state);
}

function findUserByKey(state, apiKey) {
    if (!apiKey) return null;
    const hash = sha256(apiKey);
    return Object.values(state.users).find(u => u.keyHash === hash) || null;
}

async function getMatchByFixtureId(dateStr, fixtureId) {
    const matchesPath = path.join(DATA_DIR, `matches_${dateStr}.json`);
    const matches = await readJsonFile(matchesPath, []);
    if (!Array.isArray(matches)) return null;
    return matches.find(m => m && m.fixture_id === fixtureId) || null;
}

function evaluatePickPoints({ market, selection, score }) {
    const result = computeMarketResult(market, score);
    if (result === null) return null;
    const sel = selection === 'N' ? false : true;
    const correct = sel === result;
    return { correct, points: correct ? 10 : -5 };
}

function evaluateParlayPoints(legsEvaluations) {
    if (!Array.isArray(legsEvaluations) || legsEvaluations.length < 2) return null;
    const allCorrect = legsEvaluations.every(e => e && e.correct === true);
    if (!allCorrect) return { correct: false, points: -10 };
    const legs = legsEvaluations.length;
    const base = 25;
    const extra = Math.max(0, legs - 2) * 5;
    const points = Math.min(60, base + extra);
    return { correct: true, points };
}

async function computeUserPointsForDates(state, userId, dateList, tournamentWindow) {
    const userPicks = state.picks[userId] || {};
    const picks = [];
    for (const pick of Object.values(userPicks)) {
        if (!pick || !pick.date || !dateList.includes(pick.date)) continue;
        if (tournamentWindow) {
            if (pick.date < tournamentWindow.startDate || pick.date > tournamentWindow.endDate) continue;
        }
        picks.push(pick);
    }

    const pointsByFixture = {};
    let points = 0;
    let correct = 0;
    let settled = 0;

    for (const pick of picks) {
        const match = await getMatchByFixtureId(pick.date, pick.fixture_id);
        if (!match || match.status !== 'FT') continue;
        const score = parseScore(match.time);
        if (!score) continue;
        const evaluation = evaluatePickPoints({ market: pick.market, selection: pick.selection, score });
        if (!evaluation) continue;
        settled += 1;
        points += evaluation.points;
        if (evaluation.correct) correct += 1;

        const key = `${pick.date}|${pick.fixture_id}`;
        if (!pointsByFixture[key]) pointsByFixture[key] = {};
        pointsByFixture[key][pick.market] = evaluation.correct;
    }

    for (const fixtureKey of Object.keys(pointsByFixture)) {
        const v = pointsByFixture[fixtureKey];
        if (v.GG === true && v.O25 === true) {
            points += 5;
        }
    }

    return { points, correct, settled };
}

async function computeUserParlayPointsForTournament(state, userId, tournamentId, tournamentWindow) {
    const userParlays = state.parlays[userId] || {};
    const parlays = [];
    for (const p of Object.values(userParlays)) {
        if (!p || p.tournamentId !== tournamentId) continue;
        if (!p.date) continue;
        if (tournamentWindow) {
            if (p.date < tournamentWindow.startDate || p.date > tournamentWindow.endDate) continue;
        }
        parlays.push(p);
    }

    parlays.sort((a, b) => (a.date > b.date ? 1 : -1));

    let points = 0;
    let correct = 0;
    let settled = 0;

    for (const parlay of parlays) {
        const legs = Array.isArray(parlay.legs) ? parlay.legs : [];
        if (legs.length < 2) continue;

        const evaluations = [];
        let allSettled = true;

        for (const leg of legs) {
            const match = await getMatchByFixtureId(parlay.date, leg.fixture_id);
            if (!match || match.status !== 'FT') {
                allSettled = false;
                break;
            }
            const score = parseScore(match.time);
            if (!score) {
                allSettled = false;
                break;
            }
            const evaluation = evaluatePickPoints({ market: leg.market, selection: leg.selection, score });
            if (!evaluation) {
                allSettled = false;
                break;
            }
            evaluations.push(evaluation);
        }

        if (!allSettled) continue;

        const parlayEval = evaluateParlayPoints(evaluations);
        if (!parlayEval) continue;

        settled += 1;
        points += parlayEval.points;
        if (parlayEval.correct) correct += 1;
    }

    return { points, correct, settled };
}

async function computeUserKnockoutStats(state, userId, dateList, strikeLimit, tournamentWindow) {
    const userPicks = state.picks[userId] || {};
    const picks = [];
    for (const pick of Object.values(userPicks)) {
        if (!pick || !pick.date || !dateList.includes(pick.date)) continue;
        if (tournamentWindow) {
            if (pick.date < tournamentWindow.startDate || pick.date > tournamentWindow.endDate) continue;
        }
        picks.push(pick);
    }

    picks.sort((a, b) => {
        if (a.date !== b.date) return a.date > b.date ? 1 : -1;
        if (a.fixture_id !== b.fixture_id) return a.fixture_id > b.fixture_id ? 1 : -1;
        return a.market > b.market ? 1 : -1;
    });

    const pointsByFixture = {};
    let points = 0;
    let correct = 0;
    let settled = 0;
    let strikes = 0;
    let eliminatedOn = null;

    for (const pick of picks) {
        const match = await getMatchByFixtureId(pick.date, pick.fixture_id);
        if (!match || match.status !== 'FT') continue;
        const score = parseScore(match.time);
        if (!score) continue;
        const evaluation = evaluatePickPoints({ market: pick.market, selection: pick.selection, score });
        if (!evaluation) continue;

        settled += 1;
        points += evaluation.points;
        if (evaluation.correct) {
            correct += 1;
        } else {
            strikes += 1;
            if (strikeLimit != null && strikes >= strikeLimit) {
                eliminatedOn = pick.date;
                break;
            }
        }

        const key = `${pick.date}|${pick.fixture_id}`;
        if (!pointsByFixture[key]) pointsByFixture[key] = {};
        pointsByFixture[key][pick.market] = evaluation.correct;
    }

    for (const fixtureKey of Object.keys(pointsByFixture)) {
        const v = pointsByFixture[fixtureKey];
        if (v.GG === true && v.O25 === true) {
            points += 5;
        }
    }

    const eliminated = strikeLimit != null ? strikes >= strikeLimit : false;
    return { points, correct, settled, strikes, eliminated, eliminatedOn };
}

async function registerCommunityUser(name, isPremium) {
    const cleanName = (name || '').trim().slice(0, 24);
    if (!cleanName) {
        throw new Error('Nome non valido');
    }
    const state = await loadCommunityState();
    const existing = Object.values(state.users).find(u => u.name.toLowerCase() === cleanName.toLowerCase());
    if (existing) {
        throw new Error('Nome già in uso');
    }
    const apiKey = randomKey();
    const userId = randomId('u');
    state.users[userId] = {
        id: userId,
        name: cleanName,
        keyHash: sha256(apiKey),
        createdAt: new Date().toISOString(),
        credits: 100,
        isPremium: Boolean(isPremium)
    };
    state.picks[userId] = state.picks[userId] || {};
    await saveCommunityState(state);
    return { userId, apiKey, name: cleanName, credits: 100 };
}

async function submitCommunityPicks(apiKey, payload) {
    const state = await loadCommunityState();
    const user = findUserByKey(state, apiKey);
    if (!user) throw new Error('Non autorizzato');
    if (!user.isPremium) throw new Error('Solo abbonati');

    const date = (payload && payload.date) ? String(payload.date) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Data non valida');

    const picks = Array.isArray(payload && payload.picks) ? payload.picks : [];
    if (picks.length === 0) throw new Error('Nessun pronostico');
    if (picks.length > 200) throw new Error('Troppi pronostici');

    const userPicks = state.picks[user.id] || {};
    const existingCount = Object.keys(userPicks).filter(k => k.startsWith(`${date}|`)).length;
    const incomingCount = picks.filter(p => p && typeof p === 'object' && p.fixture_id && (p.market === 'GG' || p.market === 'O25')).length;
    if (existingCount + incomingCount > DAILY_PICK_LIMIT) {
        throw new Error(`Limite giornaliero raggiunto (${DAILY_PICK_LIMIT} picks).`);
    }

    for (const p of picks) {
        if (!p || typeof p !== 'object') continue;
        const fixtureId = String(p.fixture_id || '').trim();
        const market = String(p.market || '').trim();
        const selection = String(p.selection || 'Y').trim().toUpperCase();
        if (!fixtureId) continue;
        if (market !== 'GG' && market !== 'O25') continue;
        if (selection !== 'Y' && selection !== 'N') continue;

        const key = `${date}|${fixtureId}|${market}`;
        userPicks[key] = {
            userId: user.id,
            date,
            fixture_id: fixtureId,
            market,
            selection,
            updatedAt: new Date().toISOString()
        };
    }

    state.picks[user.id] = userPicks;
    await saveCommunityState(state);
    return { ok: true, limit: DAILY_PICK_LIMIT };
}

async function submitCommunityParlay(apiKey, payload) {
    const state = await loadCommunityState();
    const user = findUserByKey(state, apiKey);
    if (!user) throw new Error('Non autorizzato');
    if (!user.isPremium) throw new Error('Solo abbonati');

    const tournamentId = payload && payload.tournamentId ? String(payload.tournamentId).trim() : '';
    const t = state.tournaments[tournamentId];
    if (!t) throw new Error('Torneo non trovato');
    if (t.scoringMode !== 'parlayOnly') throw new Error('Questo torneo non è Parlay-only');
    const participants = Array.isArray(t.participants) ? t.participants : [];
    if (!participants.includes(user.id)) throw new Error('Devi iscriverti al torneo prima di inviare un parlay');

    const date = (payload && payload.date) ? String(payload.date) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Data non valida');
    if (date < t.startDate || date > t.endDate) throw new Error('Data fuori dal torneo');

    const legs = Array.isArray(payload && payload.legs) ? payload.legs : [];
    const cleanedLegs = [];

    for (const leg of legs) {
        if (!leg || typeof leg !== 'object') continue;
        const fixtureId = String(leg.fixture_id || '').trim();
        const market = String(leg.market || '').trim();
        const selection = String(leg.selection || 'Y').trim().toUpperCase();
        if (!fixtureId) continue;
        if (market !== 'GG' && market !== 'O25') continue;
        if (selection !== 'Y' && selection !== 'N') continue;
        cleanedLegs.push({ fixture_id: fixtureId, market, selection });
    }

    const minLegs = Number.isFinite(t.parlayMinLegs) ? t.parlayMinLegs : 2;
    if (cleanedLegs.length < minLegs) throw new Error(`Parlay troppo corto (min ${minLegs} legs).`);
    if (cleanedLegs.length > 20) throw new Error('Parlay troppo lungo.');

    const userParlays = state.parlays[user.id] || {};
    const perDay = Object.values(userParlays).filter(p => p && p.date === date && p.tournamentId === tournamentId).length;
    if (perDay >= DAILY_PARLAY_LIMIT) throw new Error(`Limite giornaliero raggiunto (${DAILY_PARLAY_LIMIT} parlays).`);

    const id = randomId('p');
    userParlays[id] = {
        id,
        userId: user.id,
        tournamentId,
        date,
        legs: cleanedLegs,
        createdAt: new Date().toISOString()
    };

    state.parlays[user.id] = userParlays;
    await saveCommunityState(state);
    return { ok: true, parlayId: id, limit: DAILY_PARLAY_LIMIT };
}

async function getWeeklyLeaderboard(weekStartStr) {
    const state = await loadCommunityState();
    const baseDate = weekStartStr && /^\d{4}-\d{2}-\d{2}$/.test(weekStartStr) ? new Date(`${weekStartStr}T00:00:00Z`) : new Date();
    const weekStart = getWeekStartUTC(baseDate);
    const weekDates = Array.from({ length: 7 }, (_, i) => formatDateUTC(addDaysUTC(weekStart, i)));

    const rows = [];
    for (const user of Object.values(state.users)) {
        if (!user || !user.isPremium) continue;
        const totals = await computeUserPointsForDates(state, user.id, weekDates);
        rows.push({
            userId: user.id,
            name: user.name,
            points: totals.points,
            correct: totals.correct,
            settled: totals.settled
        });
    }

    rows.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.correct !== a.correct) return b.correct - a.correct;
        return b.settled - a.settled;
    });

    return { weekStart: formatDateUTC(weekStart), weekEnd: formatDateUTC(addDaysUTC(weekStart, 6)), leaderboard: rows };
}

async function listTournaments() {
    const state = await loadCommunityState();
    const tournaments = Object.values(state.tournaments || {}).map(t => ({
        id: t.id,
        name: t.name,
        startDate: t.startDate,
        endDate: t.endDate,
        entryFeeCredits: t.entryFeeCredits,
        maxPlayers: t.maxPlayers,
        scoringMode: t.scoringMode || 'classic',
        payoutMode: t.payoutMode || 'fixedTop3',
        strikeLimit: t.strikeLimit ?? null,
        parlayMinLegs: t.parlayMinLegs ?? null,
        participants: Array.isArray(t.participants) ? t.participants.length : 0
    }));
    tournaments.sort((a, b) => (a.startDate > b.startDate ? -1 : 1));
    return tournaments;
}

async function createTournament(apiKey, payload) {
    const state = await loadCommunityState();
    const user = findUserByKey(state, apiKey);
    if (!user) throw new Error('Non autorizzato');
    if (!user.isPremium) throw new Error('Solo abbonati');

    const name = String(payload && payload.name ? payload.name : '').trim().slice(0, 40);
    const startDate = String(payload && payload.startDate ? payload.startDate : '').trim();
    const endDate = String(payload && payload.endDate ? payload.endDate : '').trim();
    const entryFeeCredits = Number(payload && payload.entryFeeCredits != null ? payload.entryFeeCredits : 0);
    const maxPlayers = payload && payload.maxPlayers != null ? Number(payload.maxPlayers) : null;
    const scoringMode = payload && payload.scoringMode ? String(payload.scoringMode).trim() : 'classic';
    const payoutMode = payload && payload.payoutMode ? String(payload.payoutMode).trim() : 'fixedTop3';
    const strikeLimit = payload && payload.strikeLimit != null ? Number(payload.strikeLimit) : null;
    const parlayMinLegs = payload && payload.parlayMinLegs != null ? Number(payload.parlayMinLegs) : null;

    if (!name) throw new Error('Nome torneo non valido');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new Error('Date non valide');
    if (endDate < startDate) throw new Error('Intervallo non valido');
    if (!Number.isFinite(entryFeeCredits) || entryFeeCredits < 0 || entryFeeCredits > 10000) throw new Error('Quota non valida');
    if (maxPlayers != null && (!Number.isFinite(maxPlayers) || maxPlayers < 2 || maxPlayers > 1000)) throw new Error('Max players non valido');
    if (!TOURNAMENT_SCORING_MODES.has(scoringMode)) throw new Error('Modalità torneo non valida');
    if (!TOURNAMENT_PAYOUT_MODES.has(payoutMode)) throw new Error('Modalità payout non valida');
    if (strikeLimit != null && (!Number.isFinite(strikeLimit) || strikeLimit < 1 || strikeLimit > 50)) throw new Error('Strike limit non valido');
    if (parlayMinLegs != null && (!Number.isFinite(parlayMinLegs) || parlayMinLegs < 2 || parlayMinLegs > 10)) throw new Error('Min legs non valido');
    if (scoringMode === 'knockout' && strikeLimit == null) throw new Error('Strike limit richiesto per Knockout');
    if (scoringMode === 'parlayOnly' && parlayMinLegs == null) throw new Error('Min legs richiesto per Parlay-only');

    const id = randomId('t');
    state.tournaments[id] = {
        id,
        name,
        startDate,
        endDate,
        entryFeeCredits: Math.floor(entryFeeCredits),
        maxPlayers: maxPlayers != null ? Math.floor(maxPlayers) : null,
        scoringMode,
        payoutMode,
        strikeLimit: scoringMode === 'knockout' ? Math.floor(strikeLimit) : null,
        parlayMinLegs: scoringMode === 'parlayOnly' ? Math.floor(parlayMinLegs) : null,
        createdBy: user.id,
        createdAt: new Date().toISOString(),
        participants: [],
        prizeSplits: [0.6, 0.3, 0.1],
        payoutsDone: false
    };

    await saveCommunityState(state);
    return { id };
}

async function joinTournament(apiKey, tournamentId) {
    const state = await loadCommunityState();
    const user = findUserByKey(state, apiKey);
    if (!user) throw new Error('Non autorizzato');
    if (!user.isPremium) throw new Error('Solo abbonati');

    const t = state.tournaments[tournamentId];
    if (!t) throw new Error('Torneo non trovato');
    t.participants = Array.isArray(t.participants) ? t.participants : [];
    if (t.participants.includes(user.id)) return { ok: true };

    const today = formatDateUTC(startOfTodayUTC());
    if (today > t.startDate) throw new Error('Iscrizioni chiuse');
    if (t.maxPlayers != null && t.participants.length >= t.maxPlayers) throw new Error('Torneo pieno');
    if (user.credits < t.entryFeeCredits) throw new Error('Crediti insufficienti');

    user.credits -= t.entryFeeCredits;
    t.participants.push(user.id);
    await saveCommunityState(state);
    return { ok: true, credits: user.credits };
}

async function getTournamentLeaderboard(tournamentId) {
    const state = await loadCommunityState();
    const t = state.tournaments[tournamentId];
    if (!t) throw new Error('Torneo non trovato');
    const participants = Array.isArray(t.participants) ? t.participants : [];

    const windowDates = [];
    const start = new Date(`${t.startDate}T00:00:00Z`);
    const end = new Date(`${t.endDate}T00:00:00Z`);
    for (let d = new Date(start); d <= end; d = addDaysUTC(d, 1)) {
        windowDates.push(formatDateUTC(d));
    }

    const rows = [];
    for (const userId of participants) {
        const user = state.users[userId];
        if (!user) continue;
        if ((t.scoringMode || 'classic') === 'parlayOnly') {
            const totals = await computeUserParlayPointsForTournament(state, userId, t.id, { startDate: t.startDate, endDate: t.endDate });
            rows.push({ userId, name: user.name, points: totals.points, correct: totals.correct, settled: totals.settled });
        } else if ((t.scoringMode || 'classic') === 'knockout') {
            const strikeLimit = Number.isFinite(t.strikeLimit) ? t.strikeLimit : 6;
            const totals = await computeUserKnockoutStats(state, userId, windowDates, strikeLimit, { startDate: t.startDate, endDate: t.endDate });
            rows.push({ userId, name: user.name, points: totals.points, correct: totals.correct, settled: totals.settled, strikes: totals.strikes, eliminated: totals.eliminated, eliminatedOn: totals.eliminatedOn });
        } else {
            const totals = await computeUserPointsForDates(state, userId, windowDates, { startDate: t.startDate, endDate: t.endDate });
            rows.push({ userId, name: user.name, points: totals.points, correct: totals.correct, settled: totals.settled });
        }
    }

    rows.sort((a, b) => {
        if ((t.scoringMode || 'classic') === 'knockout') {
            if (Boolean(a.eliminated) !== Boolean(b.eliminated)) return a.eliminated ? 1 : -1;
            if ((a.strikes ?? 0) !== (b.strikes ?? 0)) return (a.strikes ?? 0) - (b.strikes ?? 0);
        }
        if (b.points !== a.points) return b.points - a.points;
        if (b.correct !== a.correct) return b.correct - a.correct;
        return b.settled - a.settled;
    });

    const pot = Math.max(0, (t.entryFeeCredits || 0) * participants.length);
    let payoutPreview = null;

    if ((t.payoutMode || 'fixedTop3') === 'top20') {
        const winnersCount = Math.max(1, Math.ceil(participants.length * 0.2));
        const winners = rows.slice(0, winnersCount).map(r => r.userId);
        const perWinner = winnersCount > 0 ? Math.floor(pot / winnersCount) : 0;
        payoutPreview = { payoutMode: 'top20', pot, winnersCount, perWinnerCredits: perWinner, winners };
    } else {
        const splits = Array.isArray(t.prizeSplits) && t.prizeSplits.length === 3 ? t.prizeSplits : [0.6, 0.3, 0.1];
        const winners = rows.slice(0, 3).map(r => r.userId);
        payoutPreview = {
            payoutMode: 'fixedTop3',
            pot,
            winners,
            splits,
            payoutsCredits: [
                Math.floor(pot * splits[0]),
                Math.floor(pot * splits[1]),
                Math.floor(pot * splits[2])
            ]
        };
    }

    return {
        tournament: {
            id: t.id,
            name: t.name,
            startDate: t.startDate,
            endDate: t.endDate,
            entryFeeCredits: t.entryFeeCredits,
            scoringMode: t.scoringMode || 'classic',
            payoutMode: t.payoutMode || 'fixedTop3',
            strikeLimit: t.strikeLimit ?? null,
            parlayMinLegs: t.parlayMinLegs ?? null
        },
        payoutPreview,
        leaderboard: rows
    };
}

async function getCommunityMe(apiKey) {
    const state = await loadCommunityState();
    const user = findUserByKey(state, apiKey);
    if (!user) throw new Error('Non autorizzato');
    return { userId: user.id, name: user.name, credits: user.credits, isPremium: user.isPremium };
}

/**
 * Syncs data for a specific date using SCRAPING.
 * 1. Scrapes Standings for Top Leagues (Home/Away tables)
 * 2. Scrapes Fixtures for the day
 * 3. Enriches fixtures with Home/Away stats from standings
 */
async function syncDailyData(date) {
  const managed = arguments.length > 1 && arguments[1] && arguments[1].managed === true;

  if (!managed) {
    syncStatus.isSyncing = true;
    syncStatus.jobType = 'manual';
  }

  syncStatus.currentAction = `Syncing data for ${date}...`;
  console.log(`Starting Daily SCRAPE Sync for ${date}...`);
  
  try {
      // 1. Scrape Standings for all supported leagues
      const leagueStandings = {};
      for (const [leagueName, url] of Object.entries(scraper.LEAGUE_URLS)) {
          syncStatus.currentAction = `Scraping standings: ${leagueName} (${date})`;
          console.log(`Scraping standings for ${leagueName}...`);
          try {
              const standings = await scraper.scrapeLeagueStandings(leagueName);
              leagueStandings[leagueName] = standings;
          } catch (standingsErr) {
              console.warn(`Failed to scrape standings for ${leagueName}: ${standingsErr.message}. Continuing...`);
          }
          // Sleep to be polite
          await new Promise(r => setTimeout(r, 1000));
      }
      
      // Save Standings
      syncStatus.currentAction = `Saving standings for ${date}`;
      const standingsPath = path.join(DATA_DIR, `standings_${date}.json`);
      
      // Always overwrite/create the file with fresh data
      if (fs.existsSync(standingsPath)) {
          fs.unlinkSync(standingsPath); // Delete old file first to be safe
      }
      fs.writeFileSync(standingsPath, JSON.stringify(leagueStandings, null, 2));
      console.log(`Successfully saved new standings to ${standingsPath}`);

      // 2. Scrape Fixtures
      syncStatus.currentAction = `Scraping matches for ${date}`;
      console.log("Standings synced. Now scraping matches...");
      const fixtures = await scraper.scrapeFixtures(date); 
      console.log(`Scraped ${fixtures.length} matches.`);

      // Save Matches
      syncStatus.currentAction = `Saving matches for ${date}`;
      const matchesPath = path.join(DATA_DIR, `matches_${date}.json`);
      
      try {
        if (fs.existsSync(matchesPath)) {
            await fs.promises.unlink(matchesPath);
        }
        await fs.promises.writeFile(matchesPath, JSON.stringify(fixtures, null, 2));
        console.log(`Successfully saved new matches to ${matchesPath}`);
      } catch (saveError) {
        console.error(`Error saving matches for ${date}:`, saveError);
        throw new Error(`Failed to save matches: ${saveError.message}`);
      }
      
      // 3. Save Files
      // We return the standings keys for info, but the main goal is done.
      return Object.keys(leagueStandings);
  } finally {
      if (!managed) {
          syncStatus.isSyncing = false;
          syncStatus.currentAction = 'Idle';
          syncStatus.lastSyncTime = new Date().toISOString();
          syncStatus.jobType = null;
      }
  }
}

/**
 * Gets analysis for a date.
 * Reads from file if exists.
 */
function getDailyAnalysis(date) {
    const matchesPath = path.join(DATA_DIR, `matches_${date}.json`);
    
    if (!fs.existsSync(matchesPath)) {
        return null;
    }

    const rawData = fs.readFileSync(matchesPath, 'utf-8');
    const matches = JSON.parse(rawData);

    // Group by league
    const groupedMatches = matches.reduce((acc, match) => {
        const leagueName = match.league || 'Other Matches';
        if (!acc[leagueName]) {
            acc[leagueName] = [];
        }
        acc[leagueName].push(match);
        return acc;
    }, {});

    // Load Standings if available
    const standingsPath = path.join(DATA_DIR, `standings_${date}.json`);
    let standings = {};
    if (fs.existsSync(standingsPath)) {
        try {
            standings = JSON.parse(fs.readFileSync(standingsPath, 'utf-8'));
        } catch (e) {
            console.error("Error reading standings:", e);
        }
    }

    // Return grouped matches and standings for frontend display
    return {
        matches: groupedMatches,
        standings: standings
    };
}

/**
 * Prefetches data for the next 7 days in the background.
 * Checks if data exists; if not, triggers sync.
 */
async function prefetchWeekData() {
    if (syncStatus.isSyncing) {
        console.log('[BACKGROUND] Sync already in progress. Skipping prefetch.');
        return;
    }

    const today = startOfTodayUTC();
    const desiredDates = Array.from({ length: 8 }, (_, i) => formatDateUTC(addDaysUTC(today, i)));
    const desiredSet = new Set(desiredDates);

    let needsWork = false;
    for (const dateStr of desiredDates) {
        const matchesPath = path.join(DATA_DIR, `matches_${dateStr}.json`);
        const standingsPath = path.join(DATA_DIR, `standings_${dateStr}.json`);
        const okMatches = await isValidJsonFile(matchesPath);
        const okStandings = await isValidJsonFile(standingsPath);
        if (!okMatches || !okStandings) {
            needsWork = true;
            break;
        }
    }

    if (!needsWork) {
        await cleanupDataOutsideWindow(desiredSet);
        return;
    }

    syncStatus.isSyncing = true;
    syncStatus.jobType = 'prefetch';
    syncStatus.currentAction = 'Starting rolling prefetch...';
    console.log('[BACKGROUND] Starting rolling prefetch...');
    
    try {
        await cleanupDataOutsideWindow(desiredSet);

        for (let i = 0; i < desiredDates.length; i++) {
            if (manualQueue.length > 0) {
                console.log('[BACKGROUND] Manual sync queued. Pausing prefetch.');
                break;
            }

            const dateStr = desiredDates[i];
            
            syncStatus.currentAction = `Checking data for ${dateStr}`;
            const matchesPath = path.join(DATA_DIR, `matches_${dateStr}.json`);
            const standingsPath = path.join(DATA_DIR, `standings_${dateStr}.json`);
            
            const okMatches = await isValidJsonFile(matchesPath);
            const okStandings = await isValidJsonFile(standingsPath);

            if (okMatches && okStandings) {
                console.log(`[BACKGROUND] Data for ${dateStr} already exists and is valid. Skipping.`);
                continue;
            }

            syncStatus.currentAction = `Syncing missing data for ${dateStr}`;
            console.log(`[BACKGROUND] Data for ${dateStr} missing. Syncing now...`);
            try {
                await syncDailyData(dateStr, { managed: true });
                console.log(`[BACKGROUND] Synced ${dateStr} successfully.`);
                // Sleep between days to prevent overwhelming the source/server
                syncStatus.currentAction = `Cooling down...`;
                await new Promise(r => setTimeout(r, 5000)); 
            } catch (err) {
                console.error(`[BACKGROUND] Failed to sync ${dateStr}: ${err.message}`);
                syncStatus.currentAction = `Error syncing ${dateStr}: ${err.message}`;
                // Wait a bit even on error to avoid rapid failure loops
                await new Promise(r => setTimeout(r, 2000));
            }
        }
        console.log('[BACKGROUND] Rolling prefetch completed.');
    } finally {
        syncStatus.isSyncing = false;
        syncStatus.currentAction = 'Idle';
        syncStatus.lastSyncTime = new Date().toISOString();
        syncStatus.jobType = null;
        processManualQueue();
    }
}

function getSyncStatus() {
    syncStatus.queuedManual = manualQueue.length;
    return syncStatus;
}

function enqueueManualSync(date) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    if (!manualQueue.includes(targetDate)) {
        manualQueue.push(targetDate);
    }
    syncStatus.queuedManual = manualQueue.length;
    processManualQueue();
    return { queued: true, date: targetDate, queuedManual: manualQueue.length };
}

async function processManualQueue() {
    if (isProcessingManualQueue) return;
    if (syncStatus.isSyncing && syncStatus.jobType === 'prefetch') return;

    isProcessingManualQueue = true;
    try {
        while (manualQueue.length > 0) {
            const date = manualQueue.shift();
            syncStatus.queuedManual = manualQueue.length;
            syncStatus.isSyncing = true;
            syncStatus.jobType = 'manual';
            syncStatus.currentAction = `Syncing data for ${date}...`;

            try {
                await syncDailyData(date, { managed: true });
            } catch (err) {
                console.error(`[MANUAL] Failed to sync ${date}: ${err.message}`);
                syncStatus.currentAction = `Error syncing ${date}: ${err.message}`;
                await new Promise(r => setTimeout(r, 2000));
            } finally {
                syncStatus.isSyncing = false;
                syncStatus.jobType = null;
                syncStatus.currentAction = 'Idle';
                syncStatus.lastSyncTime = new Date().toISOString();
            }
        }
    } finally {
        isProcessingManualQueue = false;
        syncStatus.queuedManual = manualQueue.length;
    }
}

module.exports = {
    syncDailyData,
    getDailyAnalysis,
    prefetchWeekData,
    getSyncStatus,
    enqueueManualSync,
    registerCommunityUser,
    submitCommunityPicks,
    submitCommunityParlay,
    getWeeklyLeaderboard,
    listTournaments,
    createTournament,
    joinTournament,
    getTournamentLeaderboard,
    getCommunityMe
};
