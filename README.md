# Global Betting Stats Generator ⚽

A web application that analyzes global football fixtures to suggest **Goal Goal (GG)** and **Over 2.5 Goals** bets based on statistical performance (Home vs Away form).

## Features
- 🌍 **Global Coverage**: Analyzes matches from all available leagues.
- 📊 **Smart Analysis**:
  - Uses **Home Team's Home Form** (last 10 matches).
  - Uses **Away Team's Away Form** (last 10 matches).
- 💡 **Predictions**:
  - **GG**: Suggested if (Home Avg Scored + Away Avg Conceded ≥ 1.5) AND (Away Avg Scored + Home Avg Conceded ≥ 1.5).
  - **Over 2.5**: Suggested if Total Sum of Averages ≥ 3.5.
- 🚀 **Performance**:
  - Caching system to minimize API calls.
  - **Mock Mode** for testing without an API key.

## Project Structure
- `backend/`: Node.js + Express server (API integration & Logic).
- `frontend/`: React + Vite application (UI).

---

## 🛠️ Setup Instructions

### Prerequisites
- Node.js installed (v16 or higher).
- A free API Key from [API-Football on RapidAPI](https://rapidapi.com/api-sports/api/api-football).

### 1. Backend Setup

1. Navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure Environment:
   - The project comes with a `.env` file pre-configured for **Mock Mode**.
   - To use real data:
     1. Open `.env`.
     2. Set `USE_MOCK_DATA=false`.
     3. Paste your API Key: `API_FOOTBALL_KEY=your_rapidapi_key`.

4. Start the Server:
   ```bash
   npm start
   ```
   *Server runs on http://localhost:5000*

### 2. Frontend Setup

1. Open a new terminal and navigate to the frontend folder:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Development Server:
   ```bash
   npm run dev
   ```
   *Frontend runs on http://localhost:5173 (usually)*

---

## 🧪 Testing with Mock Data (Default)
By default, the backend is set to `USE_MOCK_DATA=true`.
This allows you to see the application in action with a static dataset of 5 matches (including Manchester City, Barcelona, etc.) without needing an API key.

To test:
1. Start Backend.
2. Start Frontend.
3. Click **"Analyze Matches"** (Date selection is ignored in Mock Mode).

## 📝 API Logic & Caching
- **Rate Limiting**: The real API has a free tier (100 requests/day).
- **Optimization**: The app caches fixtures and team stats in memory.
- **Filtering**: Matches with fewer than 5 historical games are marked as "Insufficient Data".

## ⚠️ Troubleshooting
- **CORS Error**: Ensure backend is running on port 5000.
- **Empty Results**: Check if the date selected has matches (if using Real API).
- **PowerShell Execution Policy**: If `npm` fails, try running in Command Prompt (cmd) or Git Bash.
