
const { scrapeFixtures } = require('./services/scraper');

async function test() {
    console.log("Testing scraper for 2026-03-01...");
    try {
        const matches = await scrapeFixtures('2026-03-01');
        console.log(`Total matches found: ${matches.length}`);
        
        // Group by league to see coverage
        const leagues = {};
        matches.forEach(m => {
            leagues[m.league] = (leagues[m.league] || 0) + 1;
        });
        console.log("Matches per league:", leagues);
        
        // Check for specific global leagues requested by user
        const required = ['Bolivia', 'Chile', 'Norway', 'Switzerland'];
        required.forEach(r => {
            const found = Object.keys(leagues).some(l => l.toLowerCase().includes(r.toLowerCase()));
            console.log(`League containing ${r}: ${found ? 'FOUND' : 'MISSING'}`);
        });
    } catch (e) {
        console.error(e);
    }
}

test();
