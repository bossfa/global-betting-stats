# Guida alla Pubblicazione (Deployment)

Il sito è pronto per essere pubblicato. Questa applicazione è composta da due parti:
1. **Frontend**: L'interfaccia utente (React)
2. **Backend**: Il server (Node.js/Express) che gestisce i dati e lo scraping

Ecco i passaggi per pubblicare l'applicazione su una piattaforma cloud gratuita come **Render** (consigliata per la semplicità) o **Railway**.

## Opzione consigliata: Render.com (Gratuito)

Questa opzione permette di caricare tutto il codice in un unico posto.

### 1. Preparazione
Assicurati di aver caricato tutto il codice su GitHub.
Se non hai un repository GitHub:
1. Crea un nuovo repository su GitHub.
2. Esegui questi comandi nella cartella `global-betting-stats`:
   ```bash
   git init
   git add .
   git commit -m "Primo commit per deployment"
   git branch -M main
   git remote add origin <URL-DEL-TUO-REPO>
   git push -u origin main
   ```

### 2. Configurazione su Render
1. Vai su [Render.com](https://render.com) e crea un account.
2. Clicca su **New +** e seleziona **Web Service**.
3. Collega il tuo account GitHub e seleziona il repository `global-betting-stats`.
4. Compila i seguenti campi:
   - **Name**: Scegli un nome (es. `betting-stats-app`)
   - **Region**: Frankfurt (o quella più vicina)
   - **Branch**: `main`
   - **Root Directory**: Lascia vuoto (o `.`)
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build` 
     *(Questo installerà le dipendenze e costruirà il frontend)*
   - **Start Command**: `npm start`
     *(Questo avvierà il server backend che servirà anche il frontend)*

### 3. Variabili d'Ambiente (Environment Variables)
Nella sezione "Advanced" o "Environment", aggiungi le seguenti variabili:
- `NODE_ENV`: `production`
- `API_FOOTBALL_KEY`: `d9f6152c1b2a201658388c24c43e0a4f` (o la tua chiave API se diversa)
- `USE_MOCK_DATA`: `false`

### 4. Deploy
Clicca su **Create Web Service**. Render inizierà a costruire e distribuire l'applicazione.
Una volta finito, ti fornirà un URL (es. `https://betting-stats-app.onrender.com`) dove il tuo sito sarà accessibile a tutti.

## Note Importanti
- **Persistenza Dati**: Su piani gratuiti come Render, i file salvati nella cartella `data` potrebbero essere cancellati quando il server si riavvia (che succede spesso sui piani gratuiti). Per un uso professionale, sarebbe meglio usare un database, ma per iniziare va bene così: basterà cliccare su "SCARICA DATI GIORNATA" ogni giorno.
- **Lentezza Iniziale**: I server gratuiti "vanno in sospensione" se non usati. La prima volta che apri il sito dopo un po' di tempo, potrebbe impiegare 30-60 secondi per avviarsi.

## Verifica Locale (Opzionale)
Per testare la versione di produzione sul tuo computer prima di caricare:
1. Apri un terminale in `global-betting-stats`.
2. Esegui `npm install` (se non l'hai fatto).
3. Esegui `npm run build` (creerà la cartella `frontend/dist`).
4. Esegui `npm start`.
5. Apri `http://localhost:5000` nel browser. Dovresti vedere il sito funzionante come se fosse online.
