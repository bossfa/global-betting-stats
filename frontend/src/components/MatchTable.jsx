import { useState } from 'react';

// Reuse Standings logic but render as Popup
function StandingsPopup({ standings, homeTeam, awayTeam, position }) {
  if (!standings || (!standings.home && !standings.away)) return null;

  // Helper to render a mini table
  const renderTable = (title, rows, teamsToHighlight = [], isGeneral = false) => {
    // Filter rows to only show relevant teams for minimal view
    const filteredRows = rows.filter(row => teamsToHighlight.includes(row.team.name));
    
    if (filteredRows.length === 0) return null;

    return (
      <div className={`mini-standings-section ${isGeneral ? 'general' : ''}`}>
        <h5>{title}</h5>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th>P</th>
              <th>GF</th>
              <th>GA</th>
              <th>Pts</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => {
              const isHighlighted = teamsToHighlight.includes(row.team.name);
              const highlightClass = isHighlighted ? 'highlight-team' : '';
              return (
                <tr key={row.team.name} className={highlightClass}>
                  <td>{row.rank}</td>
                  <td>{row.team.name}</td>
                  <td>{row.played}</td>
                  <td>{row.goals?.for || 0}</td>
                  <td>{row.goals?.against || 0}</td>
                  <td>{row.points}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div 
      className="standings-popup"
      style={{ 
        top: position.y, 
        left: position.x 
      }}
    >
      <h3>{standings.league?.name || "League Standings"}</h3>
      {/* General Standings First and Distinct */}
      {standings.total && standings.total.length > 0 && 
        renderTable("General", standings.total, [homeTeam, awayTeam], true)
      }
      {standings.home && renderTable("Home", standings.home, [homeTeam])}
      {standings.away && renderTable("Away", standings.away, [awayTeam])}
    </div>
  );
}

// Shared GG Logic
const calculateGGStatus = (leagueStandings, homeName, awayName) => {
  if (!leagueStandings || !leagueStandings.total || !leagueStandings.home || !leagueStandings.away) {
    return { color: 'grey', title: 'Insufficient Standings Data' };
  }

  const findTeamStats = (list, teamName) => list?.find(row => row.team.name === teamName);

  const hGen = findTeamStats(leagueStandings.total, homeName);
  const hHome = findTeamStats(leagueStandings.home, homeName);
  const aGen = findTeamStats(leagueStandings.total, awayName);
  const aAway = findTeamStats(leagueStandings.away, awayName);

  if (!hGen || !hHome || !aGen || !aAway) {
    return { color: 'grey', title: 'Team not found in standings' };
  }

  const getAvgs = (row) => {
    if (!row.played) return [0, 0];
    const gf = row.goals?.for || 0;
    const ga = row.goals?.against || 0;
    return [gf / row.played, ga / row.played];
  };

  const [hGenGF, hGenGA] = getAvgs(hGen);
  const [hHomeGF, hHomeGA] = getAvgs(hHome);
  const [aGenGF, aGenGA] = getAvgs(aGen);
  const [aAwayGF, aAwayGA] = getAvgs(aAway);

  // Calculate minVal for logic
  const allVals = [hGenGF, hGenGA, hHomeGF, hHomeGA, aGenGF, aGenGA, aAwayGF, aAwayGA];
  const minVal = Math.min(...allVals);

  // Simplified metrics for custom tooltip
  const statsData = {
    home: {
      name: homeName,
      genGF: hGenGF.toFixed(2),
      genGA: hGenGA.toFixed(2),
      homeGF: hHomeGF.toFixed(2),
      homeGA: hHomeGA.toFixed(2)
    },
    away: {
      name: awayName,
      genGF: aGenGF.toFixed(2),
      genGA: aGenGA.toFixed(2),
      awayGF: aAwayGF.toFixed(2),
      awayGA: aAwayGA.toFixed(2)
    },
    minVal: minVal.toFixed(2)
  };

  if (minVal < 1.0) return { color: 'red', title: 'Weak Pattern', stats: statsData };
  if (minVal < 1.20) return { color: 'orange', title: 'Low Moderate', stats: statsData };
  if (minVal < 1.35) return { color: 'yellow', title: 'High Moderate', stats: statsData };
  return { color: 'green', title: 'Strong Pattern', stats: statsData };
};

// Shared Over 2.5 Logic
const calculateOver25Status = (leagueStandings, homeName, awayName) => {
  if (!leagueStandings || !leagueStandings.total || !leagueStandings.home || !leagueStandings.away) {
    return { color: 'grey', title: 'Insufficient Standings Data' };
  }

  const findTeamStats = (list, teamName) => list?.find(row => row.team.name === teamName);

  const hHome = findTeamStats(leagueStandings.home, homeName);
  const aAway = findTeamStats(leagueStandings.away, awayName);

  if (!hHome || !aAway) {
    return { color: 'grey', title: 'Team not found in standings' };
  }

  const getAvgs = (row) => {
    if (!row.played) return [0, 0];
    const gf = row.goals?.for || 0;
    const ga = row.goals?.against || 0;
    return [gf / row.played, ga / row.played];
  };

  const [hHomeGF, hHomeGA] = getAvgs(hHome);
  const [aAwayGF, aAwayGA] = getAvgs(aAway);

  // Calculate Total Goals Average for Home and Away
  const homeTotalAvg = hHomeGF + hHomeGA;
  const awayTotalAvg = aAwayGF + aAwayGA;
  
  // Average of the two teams' total goals
  const totalAvg = (homeTotalAvg + awayTotalAvg) / 2;

  const statsData = {
    home: {
      name: homeName,
      totalAvg: homeTotalAvg.toFixed(2),
      homeGF: hHomeGF.toFixed(2),
      homeGA: hHomeGA.toFixed(2)
    },
    away: {
      name: awayName,
      totalAvg: awayTotalAvg.toFixed(2),
      awayGF: aAwayGF.toFixed(2),
      awayGA: aAwayGA.toFixed(2)
    },
    val: totalAvg.toFixed(2)
  };

  // Thresholds: < 2.65 Red, 2.65-2.90 Orange, 2.90-3.25 Yellow, > 3.25 Green
  if (totalAvg < 2.65) return { color: 'red', title: 'Under 2.5 Likely', stats: statsData };
  if (totalAvg < 2.90) return { color: 'orange', title: 'Moderate Over 2.5', stats: statsData };
  if (totalAvg < 3.25) return { color: 'yellow', title: 'Good Over 2.5', stats: statsData };
  return { color: 'green', title: 'Strong Over 2.5', stats: statsData };
};

function StrategyVignette({ homeTeam, awayTeam, homeStats, awayStats, ggStatus, overStatus, leagueStandings }) {
  if (!homeStats || !awayStats) {
    return (
      <div className="vignette-content">
        <div className="no-data-message">
          Detailed stats not available for this match.
        </div>
      </div>
    );
  }

  // Helper for safe number formatting
  const fmt = (val) => {
    const num = parseFloat(val);
    return isNaN(num) ? 'N/A' : num.toFixed(2);
  };

  // Fallback to Over2.5 calculated stats if detailed match stats are missing
  const homeAvgGF = parseFloat(homeStats.avgGF) || parseFloat(overStatus?.stats?.home?.homeGF);
  const awayAvgGA = parseFloat(awayStats.avgGA) || parseFloat(overStatus?.stats?.away?.awayGA);
  
  // Use pre-calculated projected goals from Over2.5 logic if available
  const projectedGoals = overStatus?.stats?.val || 'N/A';

  // Helper to find team in standings
  const findTeamInStandings = (standings, teamName) => {
    if (!standings || !standings.total) return null;
    return standings.total.find(t => t.team.name === teamName);
  };

  const homeStanding = findTeamInStandings(leagueStandings, homeTeam);
  const awayStanding = findTeamInStandings(leagueStandings, awayTeam);

  // --- Correct Score Prediction Logic ---
  let predictedScore = "N/A";
  if (homeStanding && awayStanding && homeStanding.played > 0 && awayStanding.played > 0) {
    // We use the "Total" standings (home + away) for a general strength, 
    // BUT specific home/away performance is better. 
    // Let's try to get specific home/away tables if available in leagueStandings
    // or fallback to the total table data we have in homeStanding variable (which is from 'total' usually).
    
    // Actually, leagueStandings has .home and .away arrays!
    const hHomeTable = leagueStandings.home?.find(t => t.team.name === homeTeam);
    const aAwayTable = leagueStandings.away?.find(t => t.team.name === awayTeam);

    if (hHomeTable && aAwayTable && hHomeTable.played > 0 && aAwayTable.played > 0) {
        // Method 1: Simple Average of Attack vs Defense
        // Home Exp Goals = (Home HomeScoredAvg + Away AwayConcededAvg) / 2
        const hScoredAvg = hHomeTable.goals.for / hHomeTable.played;
        const aConcededAvg = aAwayTable.goals.against / aAwayTable.played;
        const homeExp = (hScoredAvg + aConcededAvg) / 2;

        // Away Exp Goals = (Away AwayScoredAvg + Home HomeConcededAvg) / 2
        const aScoredAvg = aAwayTable.goals.for / aAwayTable.played;
        const hConcededAvg = hHomeTable.goals.against / hHomeTable.played;
        const awayExp = (aScoredAvg + hConcededAvg) / 2;

        predictedScore = `${Math.round(homeExp)} - ${Math.round(awayExp)}`;
    } else {
        // Fallback to General Stats if Home/Away specific table not found (unlikely if we have total)
        const hScoredAvg = homeStanding.goals.for / homeStanding.played;
        const aConcededAvg = awayStanding.goals.against / awayStanding.played; // Rough approx using general
        const homeExp = (hScoredAvg + aConcededAvg) / 2;

        const aScoredAvg = awayStanding.goals.for / awayStanding.played;
        const hConcededAvg = homeStanding.goals.against / homeStanding.played;
        const awayExp = (aScoredAvg + hConcededAvg) / 2;
        
        predictedScore = `${Math.round(homeExp)} - ${Math.round(awayExp)}`;
    }
  }

  return (
    <div className="strategy-vignette">
      <div className="vignette-header">
        <h3>Strategy Insights & Form Analysis</h3>
      </div>
      
      <div className="vignette-content">
        {/* Recent Form or Standings Section */}
        <div className="vignette-section form-section">
          {Array.isArray(homeStats.form) && homeStats.form.length > 0 ? (
            <>
              <h4>Recent Form (Last 5 Matches)</h4>
              <div className="form-row">
                <span className="team-label">{homeTeam}</span>
                <div className="form-badges">
                  {homeStats.form.map((m, i) => (
                    <span key={i} className={`form-badge ${m?.result?.toLowerCase() || 'd'}`} title={`Score: ${m?.score || 'N/A'}`}>
                      {m?.result || '-'}
                    </span>
                  ))}
                </div>
              </div>
              <div className="form-row">
                <span className="team-label">{awayTeam}</span>
                <div className="form-badges">
                  {awayStats.form.map((m, i) => (
                    <span key={i} className={`form-badge ${m?.result?.toLowerCase() || 'd'}`} title={`Score: ${m?.score || 'N/A'}`}>
                      {m?.result || '-'}
                    </span>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <h4>League Standings Overview</h4>
              {homeStanding && awayStanding ? (
                <div className="standings-overview">
                  <div className="standings-row header">
                    <span>Rank</span>
                    <span>Team</span>
                    <span>Pts</span>
                    <span>GF:GA</span>
                  </div>
                  <div className="standings-row">
                    <span className="rank-badge">{homeStanding.rank}</span>
                    <span className="team-name">{homeStanding.team.name}</span>
                    <span className="team-pts">{homeStanding.points}</span>
                    <span className="team-goals">{homeStanding.goals.for}:{homeStanding.goals.against}</span>
                  </div>
                  <div className="standings-row">
                    <span className="rank-badge">{awayStanding.rank}</span>
                    <span className="team-name">{awayStanding.team.name}</span>
                    <span className="team-pts">{awayStanding.points}</span>
                    <span className="team-goals">{awayStanding.goals.for}:{awayStanding.goals.against}</span>
                  </div>
                </div>
              ) : (
                <div className="no-data-text">No Form or Standings Data Available</div>
              )}
            </>
          )}
        </div>

        {/* Key Stats Grid */}
        <div className="vignette-section stats-grid">
          <div className="stat-card">
            <span className="stat-label">Home Attack Power</span>
            <span className={`stat-value ${homeAvgGF >= 1.5 ? 'high' : homeAvgGF <= 1.0 ? 'low' : 'mid'}`}>
              {fmt(homeAvgGF)}
            </span>
            <span className="stat-desc">Avg Goals Scored at Home</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Away Defense Weakness</span>
            <span className={`stat-value ${awayAvgGA >= 1.5 ? 'high' : awayAvgGA <= 1.0 ? 'low' : 'mid'}`}>
              {fmt(awayAvgGA)}
            </span>
            <span className="stat-desc">Avg Goals Conceded Away</span>
          </div>
          <div className="stat-card">
            <span className="stat-label">Projected Total Goals</span>
            <span className="stat-value neutral">
              {projectedGoals}
            </span>
            <span className="stat-desc">Estimated Match Goals</span>
          </div>
          <div className="stat-card prediction-card">
            <span className="stat-label">Likely Score</span>
            <span className="stat-value highlight">
              {predictedScore}
            </span>
            <span className="stat-desc">Statistical Prediction</span>
          </div>
        </div>

        {/* Strategy Conclusion */}
        <div className="vignette-section conclusion">
          <div className="strategy-box">
            <span className="strategy-name">GG Signal</span>
            <div className={`strategy-pill ${ggStatus.color}`}>
              {ggStatus.title}
            </div>
          </div>
          <div className="strategy-box">
            <span className="strategy-name">Over 2.5 Signal</span>
            <div className={`strategy-pill ${overStatus.color}`}>
              {overStatus.title}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MatchRow({ match, leagueStandings, onMove, onLeave }) {
  const [showDetails, setShowDetails] = useState(false);

  const { homeTeam, homePosition, awayTeam, awayPosition, league, date, predictions, stats, analysis } = match;
  
  const homeName = typeof homeTeam === 'object' ? homeTeam.team_name : homeTeam;
  const awayName = typeof awayTeam === 'object' ? awayTeam.team_name : awayTeam;

  // Convert match time (UK Time) to Rome Time (+1h)
  const formatToRomeTime = (timeStr) => {
    if (!timeStr) return '';
    
    // Check if it's a score (contains - or doesn't match strict time format)
    // Strict time format: H:MM or HH:MM (minutes MUST be 2 digits)
    const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    
    if (timeMatch) {
      let [_, h, m] = timeMatch;
      let hours = parseInt(h, 10);
      let minutes = parseInt(m, 10);
      // Add 1 hour for Rome
      hours = (hours + 1) % 24;
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
    
    // If not a time, return as is (likely a score like "2:1", "FT", "Postp", etc.)
    return timeStr;
  };

  const displayTime = formatToRomeTime(match.time);

  // Determine colors for predictions
  const ggClass = predictions?.GG ? 'prediction-yes' : 'prediction-no';
  const overClass = predictions?.Over25 ? 'prediction-yes' : 'prediction-no';

  // Calculate GG Status using shared logic
  const ggStatus = calculateGGStatus(leagueStandings, homeName, awayName);
  
  // Calculate Over 2.5 Status
  const overStatus = calculateOver25Status(leagueStandings, homeName, awayName);

  // Helper to show rank if available
  const getRank = (pos) => pos && pos !== 'N/A' ? ` [${pos}]` : '';

  // Handle invalid analysis (Insufficient Data)
  if (analysis && !analysis.valid) {
    return (
      <tr className="match-row disabled-row">
        <td className="time-cell">{displayTime}</td>
        <td className="league-cell">{league}</td>
        <td className="team-cell home">{homeName}</td>
        <td className="team-cell away">{awayName}</td>
        <td colSpan="3" className="insufficient-data">
          Insufficient Data ({analysis.reason})
        </td>
      </tr>
    );
  }

  // Safe access to stats
  const homeStats = stats?.home || {};
  const awayStats = stats?.away || {};
  const hasStats = stats && stats.home && stats.away;

  return (
    <>
      <tr 
        className="match-row" 
        onMouseMove={(e) => onMove(e, leagueStandings, homeName, awayName)}
        onMouseLeave={onLeave}
      >
        <td className="time-cell">{displayTime}</td>
        <td className="league-cell">{league}</td>
        <td className="team-cell home">{homeName}{getRank(homePosition)}</td>
        <td className="team-cell away">{awayName}{getRank(awayPosition)}</td>
        <td className="prediction-cell centered-cell">
          <div className="tooltip-container">
            <span className={`status-ball ${ggStatus.color}`}></span>
            {ggStatus.stats && (
              <div className="custom-tooltip">
                <div className="tooltip-header">{ggStatus.title} (Min: {ggStatus.stats.minVal})</div>
                <div className="tooltip-grid">
                  <div className="tooltip-col">
                    <strong>{ggStatus.stats.home.name}</strong>
                    <div>Gen GF: {ggStatus.stats.home.genGF}</div>
                    <div>Gen GA: {ggStatus.stats.home.genGA}</div>
                    <div>Home GF: {ggStatus.stats.home.homeGF}</div>
                    <div>Home GA: {ggStatus.stats.home.homeGA}</div>
                  </div>
                  <div className="tooltip-col">
                    <strong>{ggStatus.stats.away.name}</strong>
                    <div>Gen GF: {ggStatus.stats.away.genGF}</div>
                    <div>Gen GA: {ggStatus.stats.away.genGA}</div>
                    <div>Away GF: {ggStatus.stats.away.awayGF}</div>
                    <div>Away GA: {ggStatus.stats.away.awayGA}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </td>
        <td className="prediction-cell centered-cell">
          <div className="tooltip-container">
            <span className={`status-ball ${overStatus.color}`}></span>
            {overStatus.stats && (
              <div className="custom-tooltip">
                <div className="tooltip-header">{overStatus.title} (Avg: {overStatus.stats.val})</div>
                <div className="tooltip-grid">
                  <div className="tooltip-col">
                    <strong>{overStatus.stats.home.name}</strong>
                    <div>Total Avg: {overStatus.stats.home.totalAvg}</div>
                    <div>Home GF: {overStatus.stats.home.homeGF}</div>
                    <div>Home GA: {overStatus.stats.home.homeGA}</div>
                  </div>
                  <div className="tooltip-col">
                    <strong>{overStatus.stats.away.name}</strong>
                    <div>Total Avg: {overStatus.stats.away.totalAvg}</div>
                    <div>Away GF: {overStatus.stats.away.awayGF}</div>
                    <div>Away GA: {overStatus.stats.away.awayGA}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </td>
        <td className="actions-cell centered-cell"
            onMouseEnter={(e) => { e.stopPropagation(); onLeave(); }}
            onMouseOver={(e) => { e.stopPropagation(); }}
            onMouseMove={(e) => { e.stopPropagation(); }}
            onClick={(e) => { e.stopPropagation(); setShowDetails(!showDetails); }}
        >
          <button className="details-btn">{showDetails ? '▲' : '▼'}</button>
        </td>
      </tr>
      {showDetails && (
        <tr className="details-row">
          <td colSpan="7">
            <StrategyVignette 
              homeTeam={homeName} 
              awayTeam={awayName} 
              homeStats={homeStats} 
              awayStats={awayStats} 
              ggStatus={ggStatus} 
              overStatus={overStatus}
              leagueStandings={leagueStandings}
            />
          </td>
        </tr>
      )}
    </>
  );
}

export default function MatchTable({ matches, standings }) {
  const [popupData, setPopupData] = useState({ 
    visible: false, 
    x: 0, 
    y: 0, 
    standings: null, 
    homeTeam: '', 
    awayTeam: '' 
  });
  const [filterGG, setFilterGG] = useState(false); // Main GG filter
  const [filterOver25, setFilterOver25] = useState(false); // Over 2.5 filter
  const [filterColors, setFilterColors] = useState(['green', 'yellow', 'orange']); // Sub-filter colors

  const handleRowMove = (e, leagueStandings, homeTeam, awayTeam) => {
    if (leagueStandings) {
      setPopupData({
        visible: true,
        x: e.clientX,
        y: e.clientY,
        standings: leagueStandings,
        homeTeam,
        awayTeam
      });
    }
  };

  const handleRowLeave = () => {
    setPopupData(prev => ({ ...prev, visible: false }));
  };

  const toggleGGFilter = () => {
    setFilterGG(!filterGG);
  };

  const toggleOver25Filter = () => {
    setFilterOver25(!filterOver25);
  };

  const toggleColorFilter = (color) => {
    if (filterColors.includes(color)) {
      setFilterColors(filterColors.filter(c => c !== color));
    } else {
      setFilterColors([...filterColors, color]);
    }
  };

  // Helper to check if a match passes the filters
  const doesMatchPassFilter = (match, leagueName) => {
    if (!filterGG && !filterOver25) return true; // No filter active

    // We need to calculate statuses here to filter
    const leagueStandings = standings ? standings[leagueName || match.league] : null;
    if (!leagueStandings) return false;

    const homeName = typeof match.homeTeam === 'object' ? match.homeTeam.team_name : match.homeTeam;
    const awayName = typeof match.awayTeam === 'object' ? match.awayTeam.team_name : match.awayTeam;

    let passesGG = true;
    if (filterGG) {
      const status = calculateGGStatus(leagueStandings, homeName, awayName);
      if (status.color === 'red' || status.color === 'grey') passesGG = false;
      else passesGG = filterColors.includes(status.color);
    }

    let passesOver = true;
    if (filterOver25) {
      const status = calculateOver25Status(leagueStandings, homeName, awayName);
      if (status.color === 'red' || status.color === 'grey') passesOver = false;
      else passesOver = filterColors.includes(status.color);
    }

    return passesGG && passesOver;
  };

  const getDate = () => {
    if (Array.isArray(matches)) {
      return matches.length > 0 ? matches[0].date : 'Selected Date';
    }
    const keys = Object.keys(matches);
    if (keys.length > 0 && matches[keys[0]].length > 0) {
      return matches[keys[0]][0].date;
    }
    return 'Selected Date';
  };

  return (
    <>
      <div className="table-wrapper">
        <div className="table-container">
          <div className="table-header-row">
            <h2>Analyzed Matches for {getDate()}</h2>
            <div className="filter-controls">
               <button 
                className={`filter-btn gg-main ${filterGG ? 'active' : ''}`}
                onClick={toggleGGFilter}
               >
                 GG Filter
               </button>

               <button 
                className={`filter-btn gg-main ${filterOver25 ? 'active' : ''}`}
                onClick={toggleOver25Filter}
               >
                 Over 2.5 Filter
               </button>
               
               {(filterGG || filterOver25) && (
                 <div className="sub-filters">
                   <button 
                    className={`filter-sub green ${filterColors.includes('green') ? 'active' : ''}`}
                    onClick={() => toggleColorFilter('green')}
                   >
                     <span className="status-ball green"></span>
                   </button>
                   <button 
                    className={`filter-sub yellow ${filterColors.includes('yellow') ? 'active' : ''}`}
                    onClick={() => toggleColorFilter('yellow')}
                   >
                     <span className="status-ball yellow"></span>
                   </button>
                   <button 
                    className={`filter-sub orange ${filterColors.includes('orange') ? 'active' : ''}`}
                    onClick={() => toggleColorFilter('orange')}
                   >
                     <span className="status-ball orange"></span>
                   </button>
                 </div>
               )}
            </div>
          </div>
          
          {/* If matches is an object (grouped by league), render sections */}
          {!Array.isArray(matches) ? (
              Object.keys(matches).map(leagueName => {
                  const filteredMatches = matches[leagueName].filter(m => doesMatchPassFilter(m, leagueName));
                  if (filteredMatches.length === 0) return null; // Hide empty leagues

                  return (
                    <div key={leagueName} className="league-section">
                        <h3 className="league-header">{leagueName}</h3>
                        <table className="match-table">
                          <thead>
                            <tr>
                              <th className="time-col">Time</th>
                              <th className="league-col">League</th>
                              <th className="team-col home">Home Team</th>
                              <th className="team-col away">Away Team</th>
                              <th className="centered-header">GG</th>
                              <th className="centered-header">Over 2.5</th>
                              <th className="actions-col"></th>
                            </tr>
                          </thead>
                          <tbody>
                              {filteredMatches.map(match => (
                                  <MatchRow 
                                      key={match.fixture_id} 
                                      match={match} 
                                      leagueStandings={standings ? standings[leagueName] : null} 
                                      onMove={handleRowMove}
                                      onLeave={handleRowLeave}
                                  />
                              ))}
                          </tbody>
                        </table>
                    </div>
                  );
              })
          ) : (
            <div className="league-section">
              <table className="match-table">
                <thead>
                  <tr>
                    <th className="time-col">Time</th>
                    <th className="league-col">League</th>
                    <th className="team-col home">Home Team</th>
                    <th className="team-col away">Away Team</th>
                    <th className="centered-header">GG</th>
                    <th className="centered-header">Over 2.5</th>
                    <th className="actions-col"></th>
                  </tr>
                </thead>
                <tbody>
                  {matches.filter(m => doesMatchPassFilter(m, m.league)).map(match => (
                    <MatchRow 
                      key={match.fixture_id} 
                      match={match} 
                      leagueStandings={standings ? standings[match.league] : null} 
                      onMove={handleRowMove}
                      onLeave={handleRowLeave}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      
      {/* Standings Popup */}
      {popupData.visible && (
        <StandingsPopup 
          standings={popupData.standings} 
          homeTeam={popupData.homeTeam} 
          awayTeam={popupData.awayTeam} 
          position={{ x: popupData.x, y: popupData.y }}
        />
      )}
    </>
  );
}
