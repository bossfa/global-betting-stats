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
    const date = new Date().toISOString().split('T')[0];
    console.log(`[CRON] Starting automatic sync for ${date}...`);
    try {
        await dataManager.syncDailyData(date);
        console.log(`[CRON] Daily sync completed for ${date}`);
    } catch (err) {
        console.error(`[CRON] Daily sync failed: ${err.message}`);
    }
});

// SYNC ENDPOINT: Triggers the daily fetch and save to file
app.post('/api/sync', async (req, res) => {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    console.log(`Manual Sync triggered for: ${date}`);
    try {
        const leagues = await dataManager.syncDailyData(date);
        res.json({ 
            message: `Sync successful. Scraped standings for: ${leagues.join(', ')}`, 
            count: 0,
            date: date
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
    const { matches, standings } = results;
    
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
      standings: standings
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
