import { useState, useEffect } from 'react'
import axios from 'axios'
import MatchTable from './components/MatchTable'
import './index.css'

function App() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [matches, setMatches] = useState([])
  const [standings, setStandings] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [needSync, setNeedSync] = useState(false)
  const [isPremium, setIsPremium] = useState(false)
  const [totalMatches, setTotalMatches] = useState(0)
  const [syncStatus, setSyncStatus] = useState({ isSyncing: false, currentAction: 'Idle' })
  const [communityKey, setCommunityKey] = useState(localStorage.getItem('communityKey') || '')
  const [communityName, setCommunityName] = useState('')
  const [communityMe, setCommunityMe] = useState(null)
  const [communityLeaderboard, setCommunityLeaderboard] = useState(null)
  const [communityTournaments, setCommunityTournaments] = useState([])
  const [communityPicksDraft, setCommunityPicksDraft] = useState({})
  const [parlayDraft, setParlayDraft] = useState({})
  const [tournamentForm, setTournamentForm] = useState({
    name: '',
    startDate: '',
    endDate: '',
    entryFeeCredits: 10,
    scoringMode: 'classic',
    payoutMode: 'fixedTop3',
    strikeLimit: 6,
    parlayMinLegs: 3
  })
  const [activeTournamentLeaderboard, setActiveTournamentLeaderboard] = useState(null)

  useEffect(() => {
    // Try to load analysis for today automatically on startup
    // We pass 'date' (which is today by default) to the function
    handleAnalyze(date);

    // Poll status every 5 seconds
    const interval = setInterval(checkStatus, 5000);
    checkStatus(); // Initial check

    return () => clearInterval(interval);
  }, []); // Empty dependency array means run once on mount

  useEffect(() => {
    if (!isPremium) return
    refreshCommunity()
  }, [isPremium, communityKey])

  const getApiUrl = () => import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000' : '')
  const DAILY_PICK_LIMIT = 20

  const refreshCommunity = async () => {
    try {
      await Promise.all([fetchCommunityMe(), fetchCommunityLeaderboard(), fetchCommunityTournaments()])
    } catch (e) {
      console.error(e)
    }
  }

  const fetchCommunityMe = async () => {
    if (!communityKey) {
      setCommunityMe(null)
      return
    }
    const apiUrl = getApiUrl()
    const res = await axios.get(`${apiUrl}/api/community/me`, { headers: { 'x-community-key': communityKey } })
    setCommunityMe(res.data)
  }

  const fetchCommunityLeaderboard = async () => {
    const apiUrl = getApiUrl()
    const res = await axios.get(`${apiUrl}/api/community/leaderboard`)
    setCommunityLeaderboard(res.data)
  }

  const fetchCommunityTournaments = async () => {
    const apiUrl = getApiUrl()
    const res = await axios.get(`${apiUrl}/api/community/tournaments`)
    setCommunityTournaments(res.data.tournaments || [])
  }

  const handleCommunityRegister = async () => {
    setError(null)
    try {
      const apiUrl = getApiUrl()
      const res = await axios.post(
        `${apiUrl}/api/community/register`,
        { name: communityName },
        { headers: { 'x-community-premium': isPremium ? 'true' : 'false' } }
      )
      const key = res.data.apiKey
      localStorage.setItem('communityKey', key)
      setCommunityKey(key)
      setCommunityName('')
      await refreshCommunity()
    } catch (e) {
      setError(e?.response?.data?.message || 'Errore registrazione Community')
    }
  }

  const handleCommunityLogout = () => {
    localStorage.removeItem('communityKey')
    setCommunityKey('')
    setCommunityMe(null)
    setCommunityPicksDraft({})
  }

  const flattenMatchesForDraft = () => {
    if (Array.isArray(matches)) return matches
    if (!matches || typeof matches !== 'object') return []
    return Object.values(matches).flat()
  }

  const getDraftPickCount = (draft) => {
    let count = 0
    Object.values(draft || {}).forEach(v => {
      if (v?.GG) count += 1
      if (v?.O25) count += 1
    })
    return count
  }

  const toggleDraftPick = (fixtureId, market) => {
    setError(null)
    setCommunityPicksDraft(prev => {
      const next = { ...prev }
      const current = next[fixtureId] || { GG: false, O25: false }
      const isTurningOn = !current[market]
      const count = getDraftPickCount(prev)
      if (isTurningOn && count >= DAILY_PICK_LIMIT) {
        setError(`Limite giornaliero: massimo ${DAILY_PICK_LIMIT} picks.`)
        return prev
      }
      next[fixtureId] = { ...current, [market]: !current[market] }
      return next
    })
  }

  const toggleParlayLeg = (fixtureId, market) => {
    setError(null)
    setParlayDraft(prev => {
      const next = { ...prev }
      const current = next[fixtureId] || { GG: false, O25: false }
      next[fixtureId] = { ...current, [market]: !current[market] }
      return next
    })
  }

  const submitCommunityPicks = async () => {
    setError(null)
    if (!communityKey) {
      setError('Devi creare un profilo Community prima di inviare pronostici.')
      return
    }
    const picks = []
    Object.entries(communityPicksDraft).forEach(([fixtureId, v]) => {
      if (v.GG) picks.push({ fixture_id: fixtureId, market: 'GG', selection: 'Y' })
      if (v.O25) picks.push({ fixture_id: fixtureId, market: 'O25', selection: 'Y' })
    })
    if (picks.length === 0) {
      setError('Seleziona almeno un pronostico (GG o Over 2.5).')
      return
    }
    if (picks.length > DAILY_PICK_LIMIT) {
      setError(`Limite giornaliero: massimo ${DAILY_PICK_LIMIT} picks.`)
      return
    }
    try {
      const apiUrl = getApiUrl()
      await axios.post(
        `${apiUrl}/api/community/picks`,
        { date, picks },
        { headers: { 'x-community-key': communityKey } }
      )
      setCommunityPicksDraft({})
      await refreshCommunity()
    } catch (e) {
      setError(e?.response?.data?.message || 'Errore invio pronostici')
    }
  }

  const handleCreateTournament = async () => {
    setError(null)
    if (!communityKey) {
      setError('Devi creare un profilo Community per creare tornei.')
      return
    }
    try {
      const apiUrl = getApiUrl()
      const payload = {
        name: tournamentForm.name,
        startDate: tournamentForm.startDate || date,
        endDate: tournamentForm.endDate || date,
        entryFeeCredits: Number(tournamentForm.entryFeeCredits || 0),
        scoringMode: tournamentForm.scoringMode,
        payoutMode: tournamentForm.payoutMode,
        strikeLimit: tournamentForm.scoringMode === 'knockout' ? Number(tournamentForm.strikeLimit || 0) : null,
        parlayMinLegs: tournamentForm.scoringMode === 'parlayOnly' ? Number(tournamentForm.parlayMinLegs || 0) : null
      }
      await axios.post(`${apiUrl}/api/community/tournaments`, payload, { headers: { 'x-community-key': communityKey } })
      setTournamentForm({
        name: '',
        startDate: '',
        endDate: '',
        entryFeeCredits: 10,
        scoringMode: 'classic',
        payoutMode: 'fixedTop3',
        strikeLimit: 6,
        parlayMinLegs: 3
      })
      await fetchCommunityTournaments()
    } catch (e) {
      setError(e?.response?.data?.message || 'Errore creazione torneo')
    }
  }

  const handleJoinTournament = async (tournamentId) => {
    setError(null)
    if (!communityKey) {
      setError('Devi creare un profilo Community per partecipare.')
      return
    }
    try {
      const apiUrl = getApiUrl()
      await axios.post(`${apiUrl}/api/community/tournaments/${tournamentId}/join`, {}, { headers: { 'x-community-key': communityKey } })
      await refreshCommunity()
    } catch (e) {
      setError(e?.response?.data?.message || 'Errore iscrizione torneo')
    }
  }

  const handleLoadTournamentLeaderboard = async (tournamentId) => {
    try {
      const apiUrl = getApiUrl()
      const res = await axios.get(`${apiUrl}/api/community/tournaments/${tournamentId}/leaderboard`)
      setActiveTournamentLeaderboard(res.data)
    } catch (e) {
      setError(e?.response?.data?.message || 'Errore caricamento classifica torneo')
    }
  }

  const submitTournamentParlay = async () => {
    setError(null)
    if (!communityKey) {
      setError('Devi creare un profilo Community prima di inviare un parlay.')
      return
    }
    const t = activeTournamentLeaderboard?.tournament
    if (!t?.id) {
      setError('Seleziona prima un torneo.')
      return
    }
    if (t.scoringMode !== 'parlayOnly') {
      setError('Questo torneo non è Parlay-only.')
      return
    }
    const legs = []
    Object.entries(parlayDraft).forEach(([fixtureId, v]) => {
      if (v.GG) legs.push({ fixture_id: fixtureId, market: 'GG', selection: 'Y' })
      if (v.O25) legs.push({ fixture_id: fixtureId, market: 'O25', selection: 'Y' })
    })
    if (legs.length < (t.parlayMinLegs || 2)) {
      setError(`Minimo ${t.parlayMinLegs || 2} legs per questo torneo.`)
      return
    }
    try {
      const apiUrl = getApiUrl()
      await axios.post(
        `${apiUrl}/api/community/parlays`,
        { tournamentId: t.id, date, legs },
        { headers: { 'x-community-key': communityKey } }
      )
      setParlayDraft({})
      await handleLoadTournamentLeaderboard(t.id)
      await refreshCommunity()
    } catch (e) {
      setError(e?.response?.data?.message || 'Errore invio parlay')
    }
  }

  const checkStatus = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000' : '');
      const response = await axios.get(`${apiUrl}/api/status`);
      setSyncStatus(response.data);
      
      // If we were waiting for data and now it's done, reload
      if (needSync && !response.data.isSyncing && response.data.lastSyncTime) {
          handleAnalyze(date);
      }
    } catch (err) {
      console.error("Status check failed", err);
    }
  }

  const handleAnalyze = async (targetDate = date) => {
    // Don't clear matches if we're just refreshing due to premium toggle
    setLoading(true)
    setError(null)
    setNeedSync(false)
    
    try {
      console.log(`Analyzing date: ${targetDate}`);
      // Use relative path for production (if served by same origin) or VITE_API_URL
      // Fallback to localhost:5000 for local development if env var is not set
      const apiUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000' : '');
      const tierParam = isPremium ? 'premium' : 'free';
      const response = await axios.get(`${apiUrl}/api/analyze?date=${targetDate}&tier=${tierParam}`)
      console.log('Received Matches:', response.data.matches);
      setMatches(response.data.matches || [])
      setStandings(response.data.standings || {})
      setTotalMatches(response.data.totalAvailable || 0)
    } catch (err) {
      console.error('Fetch Error:', err)
      if (err.response && err.response.status === 404 && err.response.data.needSync) {
        setNeedSync(true)
        // Auto-sync if data is missing for today (improves UX)
        // Only auto-sync if it's the current date or future
        // For now, let's just show the message as requested, but maybe cleaner
        setError("Dati non presenti. In attesa di scaricamento automatico o manuale...")
      } else {
        setError(`Failed to fetch analysis: ${err.message}`)
      }
    } finally {
      setLoading(false)
    }
  }

  // Effect to handle auto-refresh when sync finishes
  useEffect(() => {
    if (needSync && !syncStatus.isSyncing && syncStatus.lastSyncTime) {
         // Data just arrived!
         handleAnalyze(date);
    }
  }, [syncStatus.isSyncing, syncStatus.lastSyncTime, needSync]);

  const handleSync = async () => {
    setLoading(true)
    setError(null)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000' : '');
      await axios.post(`${apiUrl}/api/sync?date=${date}`)
      setNeedSync(true)
    } catch (err) {
      setError(`Sync Failed: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const hasMatches = Array.isArray(matches) ? matches.length > 0 : Object.keys(matches).length > 0;
  const draftPickCount = getDraftPickCount(communityPicksDraft)
  const parlayLegCount = getDraftPickCount(parlayDraft)

  return (
    <div className="container">
      <header className="header">
        <h1>Global Betting Stats Generator <span className="version-tag">v2.0</span> ⚽</h1>
        <p>Analyze matches for Goal Goal & Over 2.5</p>
      </header>

      <div className="controls">
        <input 
          type="date" 
          value={date} 
          onChange={(e) => setDate(e.target.value)} 
          className="date-picker"
        />
        <button onClick={() => handleAnalyze(date)} disabled={loading} className="analyze-btn">
          {loading ? 'Caricamento...' : 'CARICA ANALISI'}
        </button>
        
        <button onClick={handleSync} disabled={loading} className="sync-btn">
            {syncStatus.isSyncing ? 'Scaricamento in corso...' : 'SCARICA DATI GIORNATA'}
        </button>
      </div>

      {/* Sync Status Indicator */}
      {syncStatus.isSyncing && (
          <div style={{ 
              background: '#e3f2fd', 
              color: '#0d47a1', 
              padding: '10px', 
              borderRadius: '4px', 
              margin: '10px 0', 
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px'
          }}>
              <div className="spinner" style={{
                  width: '20px', 
                  height: '20px', 
                  border: '3px solid #0d47a1', 
                  borderTop: '3px solid transparent', 
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
              }}></div>
              <span>{syncStatus.currentAction || 'Scaricamento dati in background...'}</span>
              <style>{`
                  @keyframes spin {
                      0% { transform: rotate(0deg); }
                      100% { transform: rotate(360deg); }
                  }
              `}</style>
          </div>
      )}

      <div className="subscription-control" style={{ textAlign: 'center', margin: '1rem 0', padding: '1rem', background: '#222', borderRadius: '8px' }}>
          <div style={{ marginBottom: '0.5rem', color: isPremium ? '#4caf50' : '#ff9800' }}>
              Status: <strong>{isPremium ? 'PREMIUM ACCESS' : 'FREE VERSION (10% Matches)'}</strong>
          </div>
          <button 
            onClick={() => { setIsPremium(!isPremium); setTimeout(handleAnalyze, 100); }}
            style={{ 
                background: isPremium ? '#555' : '#ff9800', 
                color: 'white', 
                border: 'none', 
                padding: '0.5rem 1rem', 
                borderRadius: '4px',
                cursor: 'pointer'
            }}
          >
              {isPremium ? 'Simulate Downgrade to FREE' : 'Simulate Upgrade to PREMIUM'}
          </button>
          {!isPremium && totalMatches !== 0 && (
             <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#ccc' }}>
                 Hidden Matches: {totalMatches} (Unlock to view all)
             </div>
          )}
      </div>

      {isPremium && (
        <div style={{ margin: '1rem 0', padding: '1rem', background: '#111', borderRadius: '8px', border: '1px solid #333' }}>
          <h2 style={{ textAlign: 'center', marginBottom: '0.75rem' }}>Community</h2>

          {!communityKey ? (
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <input
                value={communityName}
                onChange={(e) => setCommunityName(e.target.value)}
                placeholder="Nickname"
                style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #444', background: '#000', color: '#fff', width: '220px' }}
              />
              <button
                onClick={handleCommunityRegister}
                style={{ padding: '0.5rem 1rem', borderRadius: '4px', border: 'none', background: '#4caf50', color: '#fff', cursor: 'pointer' }}
              >
                CREA PROFILO
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ color: '#ccc' }}>
                <strong>{communityMe?.name || 'Utente'}</strong> · Crediti: <strong>{communityMe?.credits ?? '-'}</strong>
              </div>
              <button
                onClick={handleCommunityLogout}
                style={{ padding: '0.35rem 0.75rem', borderRadius: '4px', border: '1px solid #555', background: '#222', color: '#fff', cursor: 'pointer' }}
              >
                Esci
              </button>
            </div>
          )}

          <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
            <div style={{ background: '#0b0b0b', border: '1px solid #222', borderRadius: '8px', padding: '0.75rem' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>Classifica Settimanale</h3>
              {communityLeaderboard?.leaderboard?.length ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', color: '#ddd', fontSize: '0.95rem' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '6px' }}>#</th>
                      <th style={{ textAlign: 'left', padding: '6px' }}>Utente</th>
                      <th style={{ textAlign: 'right', padding: '6px' }}>Punti</th>
                      <th style={{ textAlign: 'right', padding: '6px' }}>OK</th>
                      <th style={{ textAlign: 'right', padding: '6px' }}>Settled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {communityLeaderboard.leaderboard.slice(0, 20).map((row, idx) => (
                      <tr key={row.userId} style={{ borderTop: '1px solid #222' }}>
                        <td style={{ padding: '6px' }}>{idx + 1}</td>
                        <td style={{ padding: '6px' }}>{row.name}</td>
                        <td style={{ padding: '6px', textAlign: 'right' }}>{row.points}</td>
                        <td style={{ padding: '6px', textAlign: 'right' }}>{row.correct}</td>
                        <td style={{ padding: '6px', textAlign: 'right' }}>{row.settled}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ color: '#888' }}>Nessun dato ancora.</div>
              )}
            </div>

            <div style={{ background: '#0b0b0b', border: '1px solid #222', borderRadius: '8px', padding: '0.75rem' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>Pronostici (GG / Over 2.5)</h3>
              {!hasMatches ? (
                <div style={{ color: '#888' }}>Carica prima l’analisi di una giornata per selezionare i match.</div>
              ) : (
                <>
                  <div style={{ color: '#888', marginBottom: '0.5rem' }}>
                    Seleziona i match e invia. Punti: +10 corretto, -5 errato, +5 bonus se GG e O2.5 corretti sullo stesso match. Selezionati: {draftPickCount}/{DAILY_PICK_LIMIT}.
                  </div>
                  <div style={{ maxHeight: '360px', overflow: 'auto', border: '1px solid #222', borderRadius: '6px' }}>
                    {flattenMatchesForDraft().slice(0, 60).map((m) => (
                      <div key={m.fixture_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px', borderTop: '1px solid #151515', gap: '10px' }}>
                        <div style={{ color: '#ddd', flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {m.homeTeam?.team_name} - {m.awayTeam?.team_name}
                          </div>
                          <div style={{ fontSize: '0.85rem', color: '#888' }}>
                            {m.league} · {m.time} · {m.status}
                          </div>
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ccc' }}>
                          <input
                            type="checkbox"
                            checked={Boolean(communityPicksDraft[m.fixture_id]?.GG)}
                            disabled={!Boolean(communityPicksDraft[m.fixture_id]?.GG) && draftPickCount >= DAILY_PICK_LIMIT}
                            onChange={() => toggleDraftPick(m.fixture_id, 'GG')}
                          />
                          GG
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ccc' }}>
                          <input
                            type="checkbox"
                            checked={Boolean(communityPicksDraft[m.fixture_id]?.O25)}
                            disabled={!Boolean(communityPicksDraft[m.fixture_id]?.O25) && draftPickCount >= DAILY_PICK_LIMIT}
                            onChange={() => toggleDraftPick(m.fixture_id, 'O25')}
                          />
                          O2.5
                        </label>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.75rem' }}>
                    <button
                      onClick={submitCommunityPicks}
                      disabled={loading}
                      style={{ padding: '0.5rem 1rem', borderRadius: '4px', border: 'none', background: '#2196f3', color: '#fff', cursor: 'pointer' }}
                    >
                      INVIA PRONOSTICI
                    </button>
                  </div>
                </>
              )}
            </div>

            <div style={{ background: '#0b0b0b', border: '1px solid #222', borderRadius: '8px', padding: '0.75rem' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>Tornei</h3>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                <input
                  value={tournamentForm.name}
                  onChange={(e) => setTournamentForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Nome torneo"
                  style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #444', background: '#000', color: '#fff', flex: '1 1 220px' }}
                />
                <input
                  type="date"
                  value={tournamentForm.startDate}
                  onChange={(e) => setTournamentForm(prev => ({ ...prev, startDate: e.target.value }))}
                  style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #444', background: '#000', color: '#fff' }}
                />
                <input
                  type="date"
                  value={tournamentForm.endDate}
                  onChange={(e) => setTournamentForm(prev => ({ ...prev, endDate: e.target.value }))}
                  style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #444', background: '#000', color: '#fff' }}
                />
                <input
                  type="number"
                  value={tournamentForm.entryFeeCredits}
                  onChange={(e) => setTournamentForm(prev => ({ ...prev, entryFeeCredits: e.target.value }))}
                  style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #444', background: '#000', color: '#fff', width: '120px' }}
                />
                <select
                  value={tournamentForm.scoringMode}
                  onChange={(e) => setTournamentForm(prev => ({ ...prev, scoringMode: e.target.value }))}
                  style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #444', background: '#000', color: '#fff' }}
                >
                  <option value="classic">Classic</option>
                  <option value="knockout">Knockout</option>
                  <option value="parlayOnly">Parlay-only</option>
                </select>
                <select
                  value={tournamentForm.payoutMode}
                  onChange={(e) => setTournamentForm(prev => ({ ...prev, payoutMode: e.target.value }))}
                  style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #444', background: '#000', color: '#fff' }}
                >
                  <option value="fixedTop3">Top 3 payout</option>
                  <option value="top20">Top 20% payout</option>
                </select>
                {tournamentForm.scoringMode === 'knockout' ? (
                  <input
                    type="number"
                    value={tournamentForm.strikeLimit}
                    onChange={(e) => setTournamentForm(prev => ({ ...prev, strikeLimit: e.target.value }))}
                    placeholder="Strike limit"
                    style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #444', background: '#000', color: '#fff', width: '140px' }}
                  />
                ) : null}
                {tournamentForm.scoringMode === 'parlayOnly' ? (
                  <input
                    type="number"
                    value={tournamentForm.parlayMinLegs}
                    onChange={(e) => setTournamentForm(prev => ({ ...prev, parlayMinLegs: e.target.value }))}
                    placeholder="Min legs"
                    style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #444', background: '#000', color: '#fff', width: '120px' }}
                  />
                ) : null}
                <button
                  onClick={handleCreateTournament}
                  style={{ padding: '0.5rem 1rem', borderRadius: '4px', border: 'none', background: '#ff9800', color: '#111', cursor: 'pointer' }}
                >
                  CREA
                </button>
              </div>

              {communityTournaments.length ? (
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {communityTournaments.slice(0, 20).map(t => (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', border: '1px solid #222', borderRadius: '6px', padding: '10px' }}>
                      <div style={{ color: '#ddd', flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                        <div style={{ fontSize: '0.85rem', color: '#888' }}>
                          {t.startDate} → {t.endDate} · Quota: {t.entryFeeCredits} · Players: {t.participants} · Mode: {t.scoringMode || 'classic'} · Payout: {t.payoutMode || 'fixedTop3'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => handleJoinTournament(t.id)}
                          style={{ padding: '0.35rem 0.75rem', borderRadius: '4px', border: 'none', background: '#4caf50', color: '#fff', cursor: 'pointer' }}
                        >
                          Join
                        </button>
                        <button
                          onClick={() => handleLoadTournamentLeaderboard(t.id)}
                          style={{ padding: '0.35rem 0.75rem', borderRadius: '4px', border: '1px solid #555', background: '#222', color: '#fff', cursor: 'pointer' }}
                        >
                          Classifica
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#888' }}>Nessun torneo disponibile.</div>
              )}

              {activeTournamentLeaderboard?.leaderboard?.length ? (
                <div style={{ marginTop: '0.75rem' }}>
                  <div style={{ color: '#ccc', marginBottom: '0.5rem' }}>
                    Classifica: <strong>{activeTournamentLeaderboard.tournament?.name}</strong> · Mode: <strong>{activeTournamentLeaderboard.tournament?.scoringMode}</strong> · Payout: <strong>{activeTournamentLeaderboard.tournament?.payoutMode}</strong>
                  </div>
                  {activeTournamentLeaderboard.payoutPreview ? (
                    <div style={{ color: '#888', marginBottom: '0.5rem' }}>
                      Pot: {activeTournamentLeaderboard.payoutPreview.pot} crediti
                      {activeTournamentLeaderboard.payoutPreview.payoutMode === 'top20'
                        ? ` · Vincitori: ${activeTournamentLeaderboard.payoutPreview.winnersCount} · Per vincitore: ${activeTournamentLeaderboard.payoutPreview.perWinnerCredits}`
                        : ` · Payout top3: ${activeTournamentLeaderboard.payoutPreview.payoutsCredits?.join(' / ')}`}
                    </div>
                  ) : null}
                  <table style={{ width: '100%', borderCollapse: 'collapse', color: '#ddd', fontSize: '0.95rem' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '6px' }}>#</th>
                        <th style={{ textAlign: 'left', padding: '6px' }}>Utente</th>
                        <th style={{ textAlign: 'right', padding: '6px' }}>Punti</th>
                        <th style={{ textAlign: 'right', padding: '6px' }}>OK</th>
                        <th style={{ textAlign: 'right', padding: '6px' }}>Settled</th>
                        {activeTournamentLeaderboard.tournament?.scoringMode === 'knockout' ? (
                          <>
                            <th style={{ textAlign: 'right', padding: '6px' }}>Strikes</th>
                            <th style={{ textAlign: 'left', padding: '6px' }}>Stato</th>
                          </>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {activeTournamentLeaderboard.leaderboard.slice(0, 20).map((row, idx) => (
                        <tr key={row.userId} style={{ borderTop: '1px solid #222' }}>
                          <td style={{ padding: '6px' }}>{idx + 1}</td>
                          <td style={{ padding: '6px' }}>{row.name}</td>
                          <td style={{ padding: '6px', textAlign: 'right' }}>{row.points}</td>
                          <td style={{ padding: '6px', textAlign: 'right' }}>{row.correct}</td>
                          <td style={{ padding: '6px', textAlign: 'right' }}>{row.settled}</td>
                          {activeTournamentLeaderboard.tournament?.scoringMode === 'knockout' ? (
                            <>
                              <td style={{ padding: '6px', textAlign: 'right' }}>{row.strikes ?? 0}</td>
                              <td style={{ padding: '6px' }}>{row.eliminated ? `ELIM (${row.eliminatedOn || '-'})` : 'ATTIVO'}</td>
                            </>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {activeTournamentLeaderboard.tournament?.scoringMode === 'parlayOnly' ? (
                    <div style={{ marginTop: '0.75rem', borderTop: '1px solid #222', paddingTop: '0.75rem' }}>
                      <div style={{ color: '#ccc', marginBottom: '0.5rem' }}>
                        Parlay (min {activeTournamentLeaderboard.tournament?.parlayMinLegs || 2} legs) · Selezionati: {parlayLegCount}
                      </div>
                      {!hasMatches ? (
                        <div style={{ color: '#888' }}>Carica prima l’analisi di una giornata per selezionare i match.</div>
                      ) : (
                        <>
                          <div style={{ maxHeight: '240px', overflow: 'auto', border: '1px solid #222', borderRadius: '6px' }}>
                            {flattenMatchesForDraft().slice(0, 60).map((m) => (
                              <div key={m.fixture_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px', borderTop: '1px solid #151515', gap: '10px' }}>
                                <div style={{ color: '#ddd', flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {m.homeTeam?.team_name} - {m.awayTeam?.team_name}
                                  </div>
                                  <div style={{ fontSize: '0.85rem', color: '#888' }}>
                                    {m.league} · {m.time} · {m.status}
                                  </div>
                                </div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ccc' }}>
                                  <input
                                    type="checkbox"
                                    checked={Boolean(parlayDraft[m.fixture_id]?.GG)}
                                    onChange={() => toggleParlayLeg(m.fixture_id, 'GG')}
                                  />
                                  GG
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ccc' }}>
                                  <input
                                    type="checkbox"
                                    checked={Boolean(parlayDraft[m.fixture_id]?.O25)}
                                    onChange={() => toggleParlayLeg(m.fixture_id, 'O25')}
                                  />
                                  O2.5
                                </label>
                              </div>
                            ))}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.75rem' }}>
                            <button
                              onClick={submitTournamentParlay}
                              disabled={loading}
                              style={{ padding: '0.5rem 1rem', borderRadius: '4px', border: 'none', background: '#9c27b0', color: '#fff', cursor: 'pointer' }}
                            >
                              INVIA PARLAY
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      <div className="results-area">
        {hasMatches ? (
          <MatchTable matches={matches} standings={standings} />
        ) : (
          !loading && <p className="placeholder-text">Select a date and click Load Analysis.</p>
        )}
      </div>
    </div>
  )
}

export default App
