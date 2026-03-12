const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
// Load ENV first
require('dotenv').config();

// FORCE OVERRIDE (Temporary Fix) - Removed for Production
// process.env.USE_MOCK_DATA = 'false';
// process.env.API_FOOTBALL_KEY = 'd9f6152c1b2a201658388c24c43e0a4f';

const dataManager = require('./services/dataManager');

// Debug Environment
console.log('--- ENV CHECK ---');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('PORT:', process.env.PORT);
console.log('-----------------');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors()); // Allow all CORS for now, or configure for production
app.use(express.json());

// Serve static files from the React app if in production
if (process.env.NODE_ENV === 'production') {
  const path = require('path');
  app.use(express.static(path.join(__dirname, '../frontend/dist')));
}

// Health Check
app.get('/', (req, res) => {
  res.send('Global Betting Stats Generator API is running. Use POST /api/sync to update data.');
});

// CRON JOB: Run daily at 00:01
cron.schedule('1 0 * * *', async () => {
    console.log('[CRON] Starting daily 7-day prefetch...');
    try {
        await dataManager.prefetchWeekData();
        console.log('[CRON] Daily prefetch completed.');
    } catch (err) {
        console.error(`[CRON] Daily prefetch failed: ${err.message}`);
    }
});

// Run Prefetch on Startup (non-blocking)
setTimeout(() => {
    console.log('[STARTUP] Triggering initial 7-day prefetch in background...');
    dataManager.prefetchWeekData();
}, 5000); // Wait 5s after boot to start

// STATUS ENDPOINT: Returns current background sync status
app.get('/api/status', (req, res) => {
    const status = dataManager.getSyncStatus();
    res.json(status);
});

// SYNC ENDPOINT: Triggers the daily fetch and save to file
app.post('/api/sync', async (req, res) => {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    console.log(`Manual Sync triggered for: ${date}`);
    try {
        const result = dataManager.enqueueManualSync(date);
        res.status(202).json({
            message: `Sync queued for ${result.date}`,
            date: result.date,
            queuedManual: result.queuedManual
        });
    } catch (error) {
        console.error('Sync Error:', error);
        res.status(500).json({ message: 'Sync failed', error: error.message });
    }
});

// ANALYZE ENDPOINT: Reads from static file
app.get('/api/analyze', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    console.log(`Reading analysis for date: ${date}`);

    // 1. Get Analysis from File
    const results = dataManager.getDailyAnalysis(date);

    if (results === null) {
      // File doesn't exist.
      return res.status(404).json({ 
          message: 'No local data found for this date. Please Sync first.',
          needSync: true 
      });
    }

    // 2. Return results
    let { matches, standings } = results;
    
    // FREEMIUM LOGIC
    const tier = req.query.tier || 'free';
    const isPremium = tier === 'premium';
    
    if (!isPremium) {
        console.log(`[FREEMIUM] User is FREE tier. Filtering matches...`);
        // Filter matches: Keep only 10% (or at least 1) per league
        const filteredMatches = {};
        for (const [league, matchList] of Object.entries(matches)) {
            const limit = Math.max(1, Math.ceil(matchList.length * 0.10));
            // Or maybe just show the first 2-3 matches per league?
            // Let's stick to 10% logic:
            filteredMatches[league] = matchList.slice(0, limit);
        }
        matches = filteredMatches;
    }

    let count = 0;
    if (Array.isArray(matches)) {
        count = matches.length;
    } else {
        // Count from object
        count = Object.values(matches).reduce((acc, list) => acc + list.length, 0);
    }

    res.json({
        date: date,
        count: count,
        matches: matches,
        standings: standings,
        isPremium: isPremium,
        totalAvailable: !isPremium ? "Hidden (Upgrade to view)" : count
    });

  } catch (error) {
    console.error('Server Error:', error);
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
});

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
if (process.env.NODE_ENV === 'production') {
  const path = require('path');
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
