const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const BASE_URL = 'https://v3.football.api-sports.io';
const API_KEY = process.env.API_FOOTBALL_KEY || 'd9f6152c1b2a201658388c24c43e0a4f';
const MOCK_DATA_PATH = path.join(__dirname, '../data/mock_data.json');

// In-memory cache
const cache = {
  fixtures: {}, // Key: date
  teamStats: {}, // Key: teamId_venue (e.g., "33_home", "45_away")
  standings: {} // Key: leagueId_season
};

const axiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    'x-rapidapi-host': 'v3.football.api-sports.io',
    'x-rapidapi-key': API_KEY
  }
});

/**
 * Fetch RAW fixtures for a specific date (Top Leagues only).
 * @param {string} date - Format YYYY-MM-DD
 * @returns {Promise<Array>}
 */
async function getRawFixtures(date) {
  // 1. Check Mock Mode (FORCED FALSE FOR DEBUGGING)
  if (false) { // Force API Usage
    console.log('Using Mock Data for fixtures...');
    const rawData = fs.readFileSync(MOCK_DATA_PATH, 'utf-8');
    return JSON.parse(rawData);
  }

  // 2. Check Cache
  if (cache.fixtures[date]) {
    console.log(`Returning cached fixtures for ${date}`);
    return cache.fixtures[date];
  }

  try {
    // 3. Fetch from API
    console.log(`Fetching fixtures from API for ${date}...`);
    const response = await axiosInstance.get('/fixtures', {
      params: { date: date }
    });

    const fixtures = response.data.response;
    
    // Top Leagues Filter
    const TOP_LEAGUES = [
      39, // Premier League
      135, // Serie A
      140, // La Liga
      78, // Bundesliga
      61, // Ligue 1
      88, // Eredivisie
      94, // Primeira Liga
      144, // Jupiler Pro League
      203, // Super Lig
    ];

    const fixturesToProcess = fixtures
      .filter(f => TOP_LEAGUES.includes(f.league.id));
      // .slice(0, 20); // Removed slice for full daily fetch

    console.log(`Found ${fixturesToProcess.length} matches in Top Leagues.`);
    
    // Return raw fixtures, do not enrich here
    return fixturesToProcess;

  } catch (error) {
    console.error('Error fetching fixtures:', error.message);
    throw error;
  }
}

/**
 * Fetch last X matches for a team in a specific venue.
 * @param {number} teamId 
 * @param {string} venue - 'home' or 'away'
 * @param {number} season - The season to search in
 */
async function getTeamHistory(teamId, venue, season) {
  const cacheKey = `${teamId}_${venue}_${season}`;
  
  if (cache.teamStats[cacheKey]) {
    return cache.teamStats[cacheKey];
  }

  try {
    // Delay to respect rate limits (simple approach)
    await new Promise(resolve => setTimeout(resolve, 200));

    console.log(`Fetching history for team ${teamId} (${venue}) Season ${season}...`);
    
    // STRATEGY: Get ALL matches for the team in this season, then filter manually.
    // 'last: 20' can be unreliable if API defaults to wrong season.
    const response = await axiosInstance.get('/fixtures', {
      params: {
        team: teamId,
        season: season, // EXPLICIT SEASON
        status: 'FT' 
      }
    });

    // Manually filter by venue from ALL matches in season
    let matches = response.data.response;
    
    // FALLBACK: If current season has too few matches, try previous season
    if (matches.length < 5) {
      console.log(`Too few matches (${matches.length}) in Season ${season}, trying previous season ${season - 1}...`);
      try {
        const prevSeasonResponse = await axiosInstance.get('/fixtures', {
          params: {
            team: teamId,
            season: season - 1,
            status: 'FT'
          }
        });
        // Merge matches (current season first, then previous)
        matches = [...matches, ...prevSeasonResponse.data.response];
      } catch (err) {
        console.warn(`Could not fetch previous season history: ${err.message}`);
      }
    }

    if (venue === 'home') {
      matches = matches.filter(m => m.teams.home.id === teamId);
    } else {
      matches = matches.filter(m => m.teams.away.id === teamId);
    }

    // Sort by date descending (newest first) just to be sure
    matches.sort((a, b) => new Date(b.fixture.date) - new Date(a.fixture.date));

    // Take the last 10 relevant ones
    matches = matches.slice(0, 10);

    console.log(`Found ${matches.length} valid ${venue} matches for team ${teamId}`);

    const formattedMatches = matches.map(m => ({
      goals_for: m.teams.home.id === teamId ? m.goals.home : m.goals.away,
      goals_against: m.teams.home.id === teamId ? m.goals.away : m.goals.home,
    }));

    cache.teamStats[cacheKey] = formattedMatches;
    return formattedMatches;

  } catch (error) {
    console.error(`Error fetching history for team ${teamId}:`, error.message);
    return []; // Return empty on error to not crash entire app
  }
}

/**
 * Fetch Standings for a league and season.
 * @param {number} leagueId 
 * @param {number} season 
 */
async function getLeagueStandings(leagueId, season) {
  const cacheKey = `${leagueId}_${season}`;

  if (cache.standings[cacheKey]) {
    return cache.standings[cacheKey];
  }

  try {
    // Delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 200));

    console.log(`Fetching standings for League ${leagueId} Season ${season}...`);
    const response = await axiosInstance.get('/standings', {
      params: {
        league: leagueId,
        season: season
      }
    });

    // The API structure for standings is response[0].league.standings[0] (usually)
    // Some leagues have groups, but usually standings[0] is the main table or we flatten.
    const leagueData = response.data.response[0]?.league?.standings;
    
    // Flatten if multiple groups (e.g. MLS, Champions League) or just take first
    const standings = leagueData ? leagueData.flat() : [];

    // FALLBACK: If empty, try previous season
    if (standings.length === 0) {
       console.log(`No standings for League ${leagueId} Season ${season}, trying previous season ${season - 1}...`);
       // Recursively call with previous season? Or just fetch here.
       // Let's call recursively but prevent infinite loop (simple check done by caller usually, but here we can do it)
       // Actually, let's just do one retry manually to avoid complexity
       const prevResponse = await axiosInstance.get('/standings', {
          params: { league: leagueId, season: season - 1 }
       });
       const prevLeagueData = prevResponse.data.response[0]?.league?.standings;
       const prevStandings = prevLeagueData ? prevLeagueData.flat() : [];
       cache.standings[cacheKey] = prevStandings;
       return prevStandings;
    }

    cache.standings[cacheKey] = standings;
    return standings;

  } catch (error) {
    console.error(`Error fetching standings for league ${leagueId}:`, error.message);
    return [];
  }
}

module.exports = {
  getRawFixtures,
  getTeamHistory,
  getLeagueStandings
};
