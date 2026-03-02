
const axios = require('axios');
const cheerio = require('cheerio');

async function testSoccerStats(date) {
    const url = `https://www.soccerstats.com/matches.asp?matchdate=${date}`;
    console.log(`Testing SoccerStats URL: ${url}`);

    try {
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const $ = cheerio.load(data);
        
        let currentLeague = 'Unknown';
        const fixtures = [];
        
        // We need to iterate sequentially to capture league context
        $('tr').each((i, el) => {
            const $el = $(el);
            const text = $el.text().trim();
            const tds = $el.find('td');
            
            // Check for League Header
            // Based on dump: "Italy - Serie A   stats"
            // Usually in a TD with bold text or specific style
            // Let's look for rows with " - " and "stats" in text, or specific structure
            // Or maybe just check if it has a link to "league=..."?
            
            const leagueLink = $el.find('a[href*="league="]');
            if (leagueLink.length > 0) {
                 // Might be a header
                 // Check if the text looks like a country/league
                 // "England - Premier League"
                 const linkText = leagueLink.text().trim();
                 if (linkText.includes(' - ') || $el.text().includes(' - ')) {
                     // Refine: "England - Premier League stats"
                     // Clean up " stats"
                     let leagueName = $el.text().trim().replace(/stats$/i, '').trim();
                     // Sometimes it has "Matches played: ..." in next row.
                     
                     // If it's short enough to be a league name
                     if (leagueName.length > 3 && leagueName.length < 50) {
                         currentLeague = leagueName;
                         // console.log(`Found League: ${currentLeague}`);
                     }
                 }
            }
            
            // Also check for "Italy - Serie A" pattern directly in text if no link found in this row
            // The dump showed "Italy - Serie A stats" in TD 196.
            if (text.includes(' - ') && text.toLowerCase().includes('stats') && text.length < 60) {
                 let leagueName = text.replace(/stats$/i, '').trim();
                 currentLeague = leagueName;
                 // console.log(`Found League (text): ${currentLeague}`);
            }

            // Match Logic
            const homeTd = $el.find('td').filter((j, td) => $(td).text().trim() === 'home');
            
            if (homeTd.length > 0) {
                // This is a Home row.
                // We need to find the paired Away row.
                // In cheerio, next() on tr might work if they are siblings.
                const nextTr = $el.next();
                const awayTd = nextTr.find('td').filter((j, td) => $(td).text().trim() === 'away');
                
                if (awayTd.length > 0) {
                     // Found pair
                     // Extract details
                     
                     // Home Row: [Team] [Time] [home]
                     let homeCellIndex = -1;
                     $el.find('td').each((j, td) => {
                        if ($(td).text().trim() === 'home') homeCellIndex = j;
                     });
                     
                     // Away Row: [Team] [away]
                     let awayCellIndex = -1;
                     nextTr.find('td').each((j, td) => {
                        if ($(td).text().trim() === 'away') awayCellIndex = j;
                     });
                     
                     if (homeCellIndex >= 2 && awayCellIndex >= 1) {
                        const homeTeam = $el.find('td').eq(homeCellIndex - 2).text().trim();
                        const time = $el.find('td').eq(homeCellIndex - 1).text().trim();
                        const awayTeam = nextTr.find('td').eq(awayCellIndex - 1).text().trim();
                        
                        if (homeTeam && awayTeam) {
                            fixtures.push({
                                date: date,
                                time: time,
                                homeTeam: homeTeam,
                                awayTeam: awayTeam,
                                league: currentLeague
                            });
                        }
                     }
                }
            }
        });
        
        console.log(`Parsed ${fixtures.length} fixtures.`);
        if (fixtures.length > 0) {
            console.log('Sample:', fixtures[0]);
            // Check leagues
            const leagues = [...new Set(fixtures.map(f => f.league))];
            console.log('Leagues found:', leagues);
        }

    } catch (error) {
        console.error('Error:', error.message);
    }
}

testSoccerStats('2026-02-28');
