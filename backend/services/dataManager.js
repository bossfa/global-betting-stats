const fs = require('fs');
const path = require('path');
const scraper = require('./scraper');
const analyzer = require('./analyzer');

const DATA_DIR = path.join(__dirname, '../data');

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

/**
 * Syncs data for a specific date using SCRAPING.
 * 1. Scrapes Standings for Top Leagues (Home/Away tables)
 * 2. Scrapes Fixtures for the day
 * 3. Enriches fixtures with Home/Away stats from standings
 */
async function syncDailyData(date) {
  console.log(`Starting Daily SCRAPE Sync for ${date}...`);
  
  // 1. Scrape Standings for all supported leagues
  const leagueStandings = {};
  for (const [leagueName, url] of Object.entries(scraper.LEAGUE_URLS)) {
      console.log(`Scraping standings for ${leagueName}...`);
      const standings = await scraper.scrapeLeagueStandings(leagueName);
      leagueStandings[leagueName] = standings;
      // Sleep to be polite
      await new Promise(r => setTimeout(r, 1000));
  }
  
  // Save Standings
  const standingsPath = path.join(DATA_DIR, `standings_${date}.json`);
  
  // Always overwrite/create the file with fresh data
  try {
      if (fs.existsSync(standingsPath)) {
          fs.unlinkSync(standingsPath); // Delete old file first to be safe
      }
      fs.writeFileSync(standingsPath, JSON.stringify(leagueStandings, null, 2));
      console.log(`Successfully saved new standings to ${standingsPath}`);
  } catch (err) {
      console.error(`Error saving standings file: ${err.message}`);
      throw err;
  }

  // 2. Scrape Fixtures
  console.log("Standings synced. Now scraping matches...");
  const fixtures = await scraper.scrapeFixtures(date); 
  console.log(`Scraped ${fixtures.length} matches.`);

  // Save Matches
  const matchesPath = path.join(DATA_DIR, `matches_${date}.json`);
  try {
      if (fs.existsSync(matchesPath)) {
          fs.unlinkSync(matchesPath);
      }
      fs.writeFileSync(matchesPath, JSON.stringify(fixtures, null, 2));
      console.log(`Successfully saved new matches to ${matchesPath}`);
  } catch (err) {
      console.error(`Error saving matches file: ${err.message}`);
  }
  
  // 3. Save Files
  // We return the standings keys for info, but the main goal is done.
  return Object.keys(leagueStandings);
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

module.exports = {
    syncDailyData,
    getDailyAnalysis
};
