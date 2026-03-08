const fs = require('fs');
const path = require('path');
const scraper = require('./scraper');
const analyzer = require('./analyzer');

const DATA_DIR = path.join(__dirname, '../data');

// Sync Status State
let syncStatus = {
    isSyncing: false,
    currentAction: 'Idle',
    lastSyncTime: null
};

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
  syncStatus.isSyncing = true;
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
      // Only reset status if not part of a larger batch (prefetch handles its own status)
      // But since this is also called directly, we rely on the caller to manage global status if needed.
      // However, for single sync calls, we might want to reset. 
      // Let's assume prefetch will override or we just set idle here if not prefetching.
      // Ideally, we shouldn't reset here if called from prefetch.
      // Simplified: We'll set idle in the caller (API or Prefetch), or we can check a flag.
      // For now, let's NOT reset here to avoid flickering during prefetch loop.
      // The caller is responsible for setting isSyncing = false.
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

    syncStatus.isSyncing = true;
    syncStatus.currentAction = 'Starting 7-day prefetch...';
    console.log('[BACKGROUND] Starting 7-day prefetch...');
    
    const today = new Date();
    
    try {
        for (let i = 0; i < 7; i++) {
            const nextDate = new Date(today);
            nextDate.setDate(today.getDate() + i);
            const dateStr = nextDate.toISOString().split('T')[0];
            
            syncStatus.currentAction = `Checking data for ${dateStr}`;
            const matchesPath = path.join(DATA_DIR, `matches_${dateStr}.json`);
            
            if (fs.existsSync(matchesPath)) {
                try {
                    // Validate JSON integrity
                    const content = await fs.promises.readFile(matchesPath, 'utf-8');
                    JSON.parse(content);
                    console.log(`[BACKGROUND] Data for ${dateStr} already exists and is valid. Skipping.`);
                    continue;
                } catch (validationErr) {
                    console.warn(`[BACKGROUND] Data for ${dateStr} is corrupted or invalid. Re-syncing...`);
                    // Fall through to sync
                }
            }

            syncStatus.currentAction = `Syncing missing data for ${dateStr}`;
            console.log(`[BACKGROUND] Data for ${dateStr} missing. Syncing now...`);
            try {
                await syncDailyData(dateStr);
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
        console.log('[BACKGROUND] 7-day prefetch completed.');
    } finally {
        syncStatus.isSyncing = false;
        syncStatus.currentAction = 'Idle';
        syncStatus.lastSyncTime = new Date().toISOString();
    }
}

function getSyncStatus() {
    return syncStatus;
}

module.exports = {
    syncDailyData,
    getDailyAnalysis,
    prefetchWeekData,
    getSyncStatus
};
