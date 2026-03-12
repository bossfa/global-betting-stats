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

  useEffect(() => {
    // Try to load analysis for today automatically on startup
    // We pass 'date' (which is today by default) to the function
    handleAnalyze(date);

    // Poll status every 5 seconds
    const interval = setInterval(checkStatus, 5000);
    checkStatus(); // Initial check

    return () => clearInterval(interval);
  }, []); // Empty dependency array means run once on mount

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
