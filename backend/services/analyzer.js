/**
 * Logic for analyzing matches and generating betting tips.
 */

const MIN_MATCHES_REQUIRED = 5;
const DEFAULT_MATCHES_TO_ANALYZE = 10;

/**
 * Calculates the average goals for and against for a given set of matches.
 * @param {Array} matches - List of past matches.
 * @param {boolean} isHomeTeam - True if we are analyzing the home team (stats from home games).
 * @returns {Object|null} - { avgGF, avgGA, matchCount } or null if insufficient data.
 */
function calculateStats(matches) {
  if (!matches || matches.length < MIN_MATCHES_REQUIRED) {
    return null;
  }

  // Use the most recent X matches
  const recentMatches = matches.slice(0, DEFAULT_MATCHES_TO_ANALYZE);
  const count = recentMatches.length;

  let totalGF = 0;
  let totalGA = 0;

  recentMatches.forEach(match => {
    totalGF += match.goals_for;
    totalGA += match.goals_against;
  });

  return {
    avgGF: totalGF / count,
    avgGA: totalGA / count,
    matchCount: count
  };
}

/**
 * Extracts the last 5 match results.
 * @param {Array} matches - List of past matches.
 * @returns {Array} - Array of formatted match objects {result, score}.
 */
function getRecentForm(matches) {
  if (!matches) return [];
  // Use the most recent 5 matches
  return matches.slice(0, 5).map(m => {
    let result = 'D';
    if (m.goals_for > m.goals_against) result = 'W';
    else if (m.goals_for < m.goals_against) result = 'L';
    
    return {
      result, // 'W', 'D', 'L'
      score: `${m.goals_for}-${m.goals_against}`
    };
  });
}

/**
 * Analyzes a single fixture to generate predictions.
 * @param {Object} fixture - The match data containing home and away team history.
 * @returns {Object} - Analysis result with predictions.
 */
function analyzeFixture(fixture) {
  const { homeTeam, awayTeam, league, date } = fixture;

  const homeStats = calculateStats(homeTeam.last_home_matches);
  const awayStats = calculateStats(awayTeam.last_away_matches);
  
  const homeForm = getRecentForm(homeTeam.last_home_matches);
  const awayForm = getRecentForm(awayTeam.last_away_matches);

  if (!homeStats || !awayStats) {
    return {
      fixture_id: fixture.fixture_id,
      league: league,
      homeTeam: homeTeam.team_name,
      awayTeam: awayTeam.team_name,
      date: date,
      analysis: {
        valid: false,
        reason: "Insufficient data (fewer than 5 matches)"
      }
    };
  }

  // Business Logic from prompt
  const Media_GF_Casa = homeStats.avgGF;
  const Media_GS_Casa = homeStats.avgGA;
  const Media_GF_Trasferta = awayStats.avgGF;
  const Media_GS_Trasferta = awayStats.avgGA;

  // Criterio GOAL GOAL (GG)
  // Suggerisci GG se (Media_GF_Casa + Media_GS_Trasferta) >= 1.5 E (Media_GF_Trasferta + Media_GS_Casa) >= 1.5
  const homeAttackStrength = Media_GF_Casa + Media_GS_Trasferta;
  const awayAttackStrength = Media_GF_Trasferta + Media_GS_Casa;
  const isGG = homeAttackStrength >= 1.5 && awayAttackStrength >= 1.5;

  // Criterio OVER 2.5
  // Suggerisci Over 2.5 se la somma totale delle medie >= 3.5
  const totalStatsSum = Media_GF_Casa + Media_GS_Casa + Media_GF_Trasferta + Media_GS_Trasferta;
  const isOver25 = totalStatsSum >= 3.5;

  return {
    fixture_id: fixture.fixture_id,
    league: league,
    homeTeam: homeTeam.team_name,
    homePosition: homeTeam.position,
    awayTeam: awayTeam.team_name,
    awayPosition: awayTeam.position,
    date: date,
    stats: {
      home: {
        avgGF: Media_GF_Casa.toFixed(2),
        avgGA: Media_GS_Casa.toFixed(2),
        count: homeStats.matchCount,
        form: homeForm
      },
      away: {
        avgGF: Media_GF_Trasferta.toFixed(2),
        avgGA: Media_GS_Trasferta.toFixed(2),
        count: awayStats.matchCount,
        form: awayForm
      }
    },
    predictions: {
      GG: isGG,
      Over25: isOver25
    },
    analysis: {
      valid: true,
      debug: {
        homeAttackStrength: homeAttackStrength.toFixed(2),
        awayAttackStrength: awayAttackStrength.toFixed(2),
        totalStatsSum: totalStatsSum.toFixed(2)
      }
    }
  };
}

module.exports = {
  analyzeFixture
};
