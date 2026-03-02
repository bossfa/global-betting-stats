import { useState } from 'react'
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

  const handleAnalyze = async () => {
    setLoading(true)
    setError(null)
    setMatches([])
    setNeedSync(false)
    
    try {
      console.log(`Analyzing date: ${date}`);
      // Use relative path for production (if served by same origin) or VITE_API_URL
      // Fallback to localhost:5000 for local development if env var is not set
      const apiUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000' : '');
      const response = await axios.get(`${apiUrl}/api/analyze?date=${date}`)
      console.log('Received Matches:', response.data.matches);
      setMatches(response.data.matches || [])
      setStandings(response.data.standings || {})
    } catch (err) {
      console.error('Fetch Error:', err)
      if (err.response && err.response.status === 404 && err.response.data.needSync) {
        setNeedSync(true)
        setError("No local data found for this date. Please sync from API.")
      } else {
        setError(`Failed to fetch analysis: ${err.message}`)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleSync = async () => {
    setLoading(true)
    setError(null)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000' : '');
      await axios.post(`${apiUrl}/api/sync?date=${date}`)
      setNeedSync(false)
      // Automatically analyze after sync
      handleAnalyze()
    } catch (err) {
      setError(`Sync Failed: ${err.message}`)
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
        <button onClick={handleAnalyze} disabled={loading} className="analyze-btn">
          {loading ? 'Caricamento...' : 'CARICA ANALISI'}
        </button>
        
        <button onClick={handleSync} disabled={loading} className="sync-btn">
            {loading ? 'Scaricamento...' : 'SCARICA DATI GIORNATA'}
        </button>
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
