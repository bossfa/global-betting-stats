const axios = require('axios');
const cheerio = require('cheerio');

// League mapping for SoccerStats (Current Season)
// Now including ALL major leagues available on SoccerStats
const LEAGUE_URLS = {
  // Top 5
  'England - Premier League': 'https://www.soccerstats.com/homeaway.asp?league=england',
  'Italy - Serie A': 'https://www.soccerstats.com/homeaway.asp?league=italy',
  'Spain - La Liga': 'https://www.soccerstats.com/homeaway.asp?league=spain',
  'Germany - Bundesliga': 'https://www.soccerstats.com/homeaway.asp?league=germany',
  'France - Ligue 1': 'https://www.soccerstats.com/homeaway.asp?league=france',
  
  // European Cups (using leagueview.asp for fixtures)
  'Europe - Champions League': 'https://www.soccerstats.com/leagueview.asp?league=cleague',
  'Europe - Europa League': 'https://www.soccerstats.com/leagueview.asp?league=uefa',
  'Europe - Conference League': 'https://www.soccerstats.com/leagueview.asp?league=conference',
  
  // Other European Leagues
  'Netherlands - Eredivisie': 'https://www.soccerstats.com/homeaway.asp?league=netherlands',
  'Portugal - Primeira Liga': 'https://www.soccerstats.com/homeaway.asp?league=portugal',
  'Belgium - Jupiler Pro League': 'https://www.soccerstats.com/homeaway.asp?league=belgium',
  'Turkey - Super Lig': 'https://www.soccerstats.com/homeaway.asp?league=turkey',
  'Scotland - Premiership': 'https://www.soccerstats.com/homeaway.asp?league=scotland',
  'Greece - Premiership': 'https://www.soccerstats.com/homeaway.asp?league=greece',
  'Austria - Bundesliga': 'https://www.soccerstats.com/homeaway.asp?league=austria',
  'Switzerland - Super League': 'https://www.soccerstats.com/homeaway.asp?league=switzerland',
  'Denmark - Bundesliga': 'https://www.soccerstats.com/homeaway.asp?league=denmark',
  'Poland - Ekstraklasa': 'https://www.soccerstats.com/homeaway.asp?league=poland',
  'Czech Republic - Ekstraklasa': 'https://www.soccerstats.com/homeaway.asp?league=czechrepublic',
  'Croatia - 1. HNL': 'https://www.soccerstats.com/homeaway.asp?league=croatia',
  'Romania - Liga I': 'https://www.soccerstats.com/homeaway.asp?league=romania',
  'Serbia - Super Liga': 'https://www.soccerstats.com/homeaway.asp?league=serbia',
  'Russia - Super Liga': 'https://www.soccerstats.com/homeaway.asp?league=russia',
  'Ukraine - Premier League': 'https://www.soccerstats.com/homeaway.asp?league=ukraine',
  'Bulgaria - First League': 'https://www.soccerstats.com/homeaway.asp?league=bulgaria',
  'Slovakia - Super Liga': 'https://www.soccerstats.com/homeaway.asp?league=slovakia',
  'Slovenia - PrvaLiga': 'https://www.soccerstats.com/homeaway.asp?league=slovenia',
  'Hungary - NB I': 'https://www.soccerstats.com/homeaway.asp?league=hungary',
  'Israel - Premier League': 'https://www.soccerstats.com/homeaway.asp?league=israel',
  'Cyprus - First Division': 'https://www.soccerstats.com/homeaway.asp?league=cyprus',
  
  // Second Divisions (Popular)
  'England - Championship': 'https://www.soccerstats.com/homeaway.asp?league=england2',
  'England - League One': 'https://www.soccerstats.com/homeaway.asp?league=england3',
  'England - League Two': 'https://www.soccerstats.com/homeaway.asp?league=england4',
  'England - National League': 'https://www.soccerstats.com/homeaway.asp?league=england5',
  'England - National League North': 'https://www.soccerstats.com/homeaway.asp?league=england6',
  'England - National League South': 'https://www.soccerstats.com/homeaway.asp?league=england7',
  'Italy - Serie B': 'https://www.soccerstats.com/homeaway.asp?league=italy2',
  'Italy - Serie C Group A': 'https://www.soccerstats.com/homeaway.asp?league=italy3a',
  'Italy - Serie C Group B': 'https://www.soccerstats.com/homeaway.asp?league=italy3b',
  'Italy - Serie C Group C': 'https://www.soccerstats.com/homeaway.asp?league=italy3c',
  'Spain - Segunda Division': 'https://www.soccerstats.com/homeaway.asp?league=spain2',
  'Germany - 2. Bundesliga': 'https://www.soccerstats.com/homeaway.asp?league=germany2',
  'France - Ligue 2': 'https://www.soccerstats.com/homeaway.asp?league=france2',
  'Netherlands - Eerste Divisie': 'https://www.soccerstats.com/homeaway.asp?league=netherlands2',
  'Belgium - Challenger Pro League': 'https://www.soccerstats.com/homeaway.asp?league=belgium2',
  
  // UK & Ireland (Others)
  'Wales - Premier League': 'https://www.soccerstats.com/homeaway.asp?league=wales',
  'Northern Ireland - Premiership': 'https://www.soccerstats.com/homeaway.asp?league=northernireland',
  'Northern Ireland - Championship': 'https://www.soccerstats.com/homeaway.asp?league=northernireland2',
  'Republic of Ireland - Premier Division': 'https://www.soccerstats.com/homeaway.asp?league=ireland',
  'Scotland - Championship': 'https://www.soccerstats.com/homeaway.asp?league=scotland2',

  // South America
  'Brazil - Serie A': 'https://www.soccerstats.com/homeaway.asp?league=brazil',
  'Argentina - Primera Division': 'https://www.soccerstats.com/homeaway.asp?league=argentina',
  'Chile - Primera Division': 'https://www.soccerstats.com/homeaway.asp?league=chile',
  'Colombia - Primera A': 'https://www.soccerstats.com/homeaway.asp?league=colombia',
  'Bolivia - Primera Division': 'https://www.soccerstats.com/homeaway.asp?league=bolivia',
  'Peru - Primera Division': 'https://www.soccerstats.com/homeaway.asp?league=peru',
  'Uruguay - Primera Division': 'https://www.soccerstats.com/homeaway.asp?league=uruguay',
  'Venezuela - Primera Division': 'https://www.soccerstats.com/homeaway.asp?league=venezuela',
  'Ecuador - Liga Pro': 'https://www.soccerstats.com/homeaway.asp?league=ecuador',
  'Paraguay - Primera Division': 'https://www.soccerstats.com/homeaway.asp?league=paraguay',

  // Nordics
  'Norway - Eliteserien': 'https://www.soccerstats.com/homeaway.asp?league=norway',
  'Sweden - Allsvenskan': 'https://www.soccerstats.com/homeaway.asp?league=sweden',
  'Finland - Veikkausliiga': 'https://www.soccerstats.com/homeaway.asp?league=finland',
  'Iceland - Urvalsdeild': 'https://www.soccerstats.com/homeaway.asp?league=iceland',

  // North America
  'USA - MLS': 'https://www.soccerstats.com/homeaway.asp?league=usa',
  'Mexico - Liga MX': 'https://www.soccerstats.com/homeaway.asp?league=mexico',

  // Asia / Oceania
  'Japan - J-League': 'https://www.soccerstats.com/homeaway.asp?league=japan',
  'South Korea - K-League 1': 'https://www.soccerstats.com/homeaway.asp?league=southkorea',
  'Australia - A-League': 'https://www.soccerstats.com/homeaway.asp?league=australia',
  'China - Super League': 'https://www.soccerstats.com/homeaway.asp?league=china',
  'Saudi Arabia - Pro League': 'https://www.soccerstats.com/homeaway.asp?league=saudiarabia',
  'India - Super League': 'https://www.soccerstats.com/homeaway.asp?league=india',
  'Jordan - Pro League': 'https://www.soccerstats.com/homeaway.asp?league=jordan',
  'UAE - Pro League': 'https://www.soccerstats.com/homeaway.asp?league=uae',
  'Qatar - Stars League': 'https://www.soccerstats.com/homeaway.asp?league=qatar',
  'Egypt - Premier League': 'https://www.soccerstats.com/homeaway.asp?league=egypt',
  'Morocco - Botola Pro': 'https://www.soccerstats.com/homeaway.asp?league=morocco',
  'South Africa - Premier Division': 'https://www.soccerstats.com/homeaway.asp?league=southafrica',
  'Thailand - Thai League 1': 'https://www.soccerstats.com/homeaway.asp?league=thailand',
  'Indonesia - Liga 1': 'https://www.soccerstats.com/homeaway.asp?league=indonesia',
  'Singapore - Premier League': 'https://www.soccerstats.com/homeaway.asp?league=singapore',
  'Malaysia - Super League': 'https://www.soccerstats.com/homeaway.asp?league=malaysia',
  'Vietnam - V.League 1': 'https://www.soccerstats.com/homeaway.asp?league=vietnam'
};

/**
 * Scrapes Home and Away standings for a given league.
 * Returns { home: [], away: [] }
 */
async function scrapeLeagueStandings(leagueName) {
  const url = LEAGUE_URLS[leagueName];
  if (!url) {
    console.warn(`No URL found for league: ${leagueName}`);
    return { home: [], away: [] };
  }

  try {
    console.log(`Scraping standings for ${leagueName} from ${url}...`);
    const { data } = await axios.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
    });
    
    const $ = cheerio.load(data);
    const homeStandings = [];
    const awayStandings = [];
    const totalStandings = []; // NEW: Overall Table

    // Filter valid standings tables: must have GP, W, D, L
    const tables = [];
    $('table').each((i, table) => {
        const headers = $(table).find('tr').first().text().trim();
        // Check for specific headers to identify a standings table
        if (headers.includes('GP') && headers.includes('W') && headers.includes('D') && headers.includes('L')) {
            // Check that it's NOT the "Tables overview" or "Offence" table
            const firstRowText = $(table).find('tr').eq(1).text();
            if (firstRowText && !headers.includes('Offence') && !headers.includes('Tables overview')) {
                tables.push(table);
            }
        }
    });

    console.log(`Found ${tables.length} valid standings tables for ${leagueName}`);

    // LOGIC for SoccerStats Home/Away Page:
    // The "Total" table is NOT explicitly shown on homeaway.asp pages usually.
    // However, we MUST have it for the user.
    // Let's create it by merging Home + Away stats manually.
    
    if (tables.length >= 2) {
        // Table 0 should be HOME
        // Table 1 should be AWAY
        homeStandings.push(...parseTable($, tables[0]));
        awayStandings.push(...parseTable($, tables[1]));
        
        // Calculate Total Standings
        const totalMap = {};
        
        // Helper to init
        const initTeam = (name) => ({
            team: { name },
            played: 0, win: 0, draw: 0, lose: 0, points: 0,
            goals: { for: 0, against: 0 }
        });

        // Process Home
        homeStandings.forEach(h => {
            if (!totalMap[h.team.name]) totalMap[h.team.name] = initTeam(h.team.name);
            const t = totalMap[h.team.name];
            t.played += h.played;
            t.win += h.win;
            t.draw += h.draw;
            t.lose += h.lose;
            t.points += h.points;
            t.goals.for += h.goals.for;
            t.goals.against += h.goals.against;
        });
        
        // Process Away
        awayStandings.forEach(a => {
            if (!totalMap[a.team.name]) totalMap[a.team.name] = initTeam(a.team.name);
            const t = totalMap[a.team.name];
            t.played += a.played;
            t.win += a.win;
            t.draw += a.draw;
            t.lose += a.lose;
            t.points += a.points;
            t.goals.for += a.goals.for;
            t.goals.against += a.goals.against;
        });
        
        // Convert to array and sort
        const totalStandingsArray = Object.values(totalMap).sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            const gdA = a.goals.for - a.goals.against;
            const gdB = b.goals.for - b.goals.against;
            return gdB - gdA; // GD desc
        });
        
        // Add rank
        totalStandingsArray.forEach((team, index) => {
            team.rank = index + 1;
        });
        
        return {
            home: homeStandings,
            away: awayStandings,
            total: totalStandingsArray
        };
    } else {
        console.warn(`Warning: Found fewer than 2 standings tables for ${leagueName}. Data might be incomplete.`);
    }

    return {
        home: homeStandings,
        away: awayStandings,
        total: []
    };

  } catch (error) {
    console.error(`Error scraping ${leagueName}:`, error.message);
    return { home: [], away: [] };
  }
}

function parseTable($, tableNode) {
    const data = [];
    // Skip the first row (headers)
    const rows = $(tableNode).find('tr').slice(1);
    
    rows.each((i, row) => {
        const cols = $(row).find('td');
        // Check if row is valid (enough columns)
        if (cols.length < 8) return;

        // Extract text
        // Rank | Team | GP | W | D | L | GF | GA | GD | Pts
        // 0      1      2    3   4   5   6    7    8    9
        
        let rank = $(cols[0]).text().trim();
        let teamName = $(cols[1]).text().trim();
        
        const gp = parseInt($(cols[2]).text().trim());
        const w = parseInt($(cols[3]).text().trim());
        const d = parseInt($(cols[4]).text().trim());
        const l = parseInt($(cols[5]).text().trim());
        const gf = parseInt($(cols[6]).text().trim());
        const ga = parseInt($(cols[7]).text().trim());
        const pts = parseInt($(cols[9]).text().trim()); // Points usually col 9

        // Validate
        if (teamName && !isNaN(gp)) {
            data.push({
                rank,
                team: { name: teamName },
                played: gp,
                win: w,
                draw: d,
                lose: l,
                points: pts,
                goals: { for: gf, against: ga }
            });
        }
    });
    return data;
}


/**
 * Scrapes fixtures for a specific date from SoccerStats.
 * Iterates through all supported leagues and fetches their result/fixture pages.
 * Bypasses the 10-match limit on the main matches.asp page.
 */
async function scrapeFixtures(date) {
    console.log(`Starting global scrape for date: ${date}`);
    const fixtures = [];
    const dateObj = new Date(date);
    const day = dateObj.getDate();
    const monthStr = dateObj.toLocaleString('en-US', { month: 'short' }); // "Mar"
    const monthIndex = dateObj.getMonth() + 1; // 1-12
    const dateSearchStr = `${day} ${monthStr}`; // e.g. "1 Mar"
    
    // Create batches of leagues to scrape in parallel
    const leagueEntries = Object.entries(LEAGUE_URLS);
    const BATCH_SIZE = 5;
    
    for (let i = 0; i < leagueEntries.length; i += BATCH_SIZE) {
        const batch = leagueEntries.slice(i, i + BATCH_SIZE);
        console.log(`Processing batch ${i/BATCH_SIZE + 1}/${Math.ceil(leagueEntries.length/BATCH_SIZE)}...`);
        
        const promises = batch.map(async ([leagueName, url]) => {
            try {
                // Check if it's a Cup competition (using leagueview.asp)
                if (url.includes('leagueview.asp')) {
                    const matches = await scrapeCupFixtures(leagueName, url, dateSearchStr, date);
                    fixtures.push(...matches);
                } else {
                    const leagueCode = url.split('league=')[1].split('&')[0];
                    const matches = await scrapeLeagueFixtures(leagueName, leagueCode, monthIndex, dateSearchStr, date);
                    fixtures.push(...matches);
                }
            } catch (err) {
                console.error(`Failed to scrape ${leagueName}: ${err.message}`);
            }
        });
        
        await Promise.all(promises);
        // Small delay to be nice to the server
        await new Promise(r => setTimeout(r, 500));
    }

    console.log(`Total fixtures found: ${fixtures.length}`);
    return fixtures;
}

/**
 * Scrapes fixtures for a specific league and date.
 */
async function scrapeLeagueFixtures(leagueName, leagueCode, monthIndex, dateSearchStr, fullDate) {
    // URL: results.asp?league={code}&pmtype=month{index}
    const url = `https://www.soccerstats.com/results.asp?league=${leagueCode}&pmtype=month${monthIndex}`;
    // console.log(`Checking ${leagueName} (${url})...`);

    try {
        const { data } = await axios.get(url, {
             headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Cookie': 'const_cook=1'
            },
            timeout: 10000 // 10s timeout
        });
        
        const $ = cheerio.load(data);
        const matches = [];

        // Structure in results.asp:
        // <tr class='odd' height='36'>
        //   <td align='right'><font>Sun 1 Mar</font></td>
        //   <td align='right'>Home</td>
        //   <td align='center'>Time/Score</td>
        //   <td align='left'>Away</td>
        //   ...
        // </tr>
        
        $('tr').each((i, row) => {
            const tds = $(row).find('td');
            if (tds.length < 4) return;
            
            const dateText = $(tds[0]).text().trim(); // "Sun 1 Mar"
            
            // Check if date matches "1 Mar" (exact word match for day)
            // We use regex to ensure "1 Mar" doesn't match "11 Mar"
            // Regex: \b1 Mar\b (assuming no extra chars attached immediately)
            // But dateText might be "Sun 1 Mar".
            const regex = new RegExp(`\\b${dateSearchStr}\\b`, 'i');
            
            if (regex.test(dateText)) {
                const homeTeam = $(tds[1]).text().trim();
                const timeScore = $(tds[2]).text().trim();
                const awayTeam = $(tds[3]).text().trim();
                
                if (homeTeam && awayTeam) {
                    matches.push({
                        fixture_id: `${fullDate}-${homeTeam}-${awayTeam}`.replace(/\s+/g, ''),
                        date: fullDate,
                        time: timeScore, // "14:00" or "2 - 1"
                        league: leagueName,
                        country: leagueName.split(' - ')[0],
                        homeTeam: { team_name: homeTeam },
                        awayTeam: { team_name: awayTeam },
                        status: timeScore.includes(':') && timeScore.length <= 5 ? 'NS' : 'FT' // Simple heuristic
                    });
                }
            }
        });
        
        if (matches.length > 0) {
            console.log(`Found ${matches.length} matches in ${leagueName}`);
        }
        
        return matches;

    } catch (error) {
        // console.warn(`Error scraping ${leagueName}: ${error.message}`);
        return [];
    }
}

/**
 * Scrapes fixtures for cup competitions from leagueview.asp pages.
 */
async function scrapeCupFixtures(leagueName, url, dateSearchStr, fullDate) {
    try {
        const { data } = await axios.get(url, {
             headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Cookie': 'const_cook=1'
            },
            timeout: 10000 
        });
        
        const $ = cheerio.load(data);
        const matches = [];

        $('tr').each((i, row) => {
            const tds = $(row).find('td');
            if (tds.length < 3) return;
            
            // Expected structure for upcoming matches:
            // TD 0: "Tu 10 Mar 17:45" (Date Time)
            // TD 1: "1/8 F" (Round)
            // TD 2: "Galatasaray - Liverpool" (Teams)
            
            // Expected structure for past matches:
            // TD 0: "Tu 30 Sep" (Date)
            // TD 1: Empty
            // TD 2: "Galatasaray - Liverpool" (Teams)
            // TD 3: "1:0" (Score)

            const dateText = $(tds[0]).text().trim();
            // Regex to match "10 Mar" regardless of "Tu " prefix
            const regex = new RegExp(`\\b${dateSearchStr}\\b`, 'i');

            if (regex.test(dateText)) {
                let homeTeam, awayTeam, timeScore, status;
                
                // Try to parse teams from TD 2
                const teamsText = $(tds[2]).text().trim();
                if (teamsText.includes(' - ')) {
                    const parts = teamsText.split(' - ');
                    homeTeam = parts[0].trim();
                    awayTeam = parts[1].trim();
                }

                // If teams not found in TD 2, skip
                if (!homeTeam || !awayTeam) return;

                // Determine time/score
                // Extract time from dateText: "Tu 10 Mar 17:45" -> "17:45"
                const timeMatch = dateText.match(/\d{2}:\d{2}/);
                if (timeMatch) {
                    timeScore = timeMatch[0];
                    status = 'NS'; // Not Started
                } else {
                    // Maybe it's a past match with score in TD 3
                    const scoreText = $(tds[3] ? tds[3] : {}).text ? $(tds[3]).text().trim() : '';
                    if (scoreText.includes(':')) {
                        timeScore = scoreText;
                        status = 'FT'; // Finished
                    } else {
                        timeScore = 'TBD';
                        status = 'NS';
                    }
                }

                if (homeTeam && awayTeam) {
                    matches.push({
                        fixture_id: `${fullDate}-${homeTeam}-${awayTeam}`.replace(/\s+/g, ''),
                        date: fullDate,
                        time: timeScore,
                        league: leagueName,
                        country: 'Europe', // Generic country for cups
                        homeTeam: { team_name: homeTeam },
                        awayTeam: { team_name: awayTeam },
                        status: status
                    });
                }
            }
        });
        
        if (matches.length > 0) {
            console.log(`Found ${matches.length} cup matches in ${leagueName}`);
        }
        
        return matches;

    } catch (error) {
        console.warn(`Error scraping cup ${leagueName}: ${error.message}`);
        return [];
    }
}


module.exports = {
    scrapeLeagueStandings,
    scrapeFixtures,
    LEAGUE_URLS
};
