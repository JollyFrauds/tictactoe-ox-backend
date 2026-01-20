# 🎮 TicTacToe OX - Backend Server

Backend Node.js per il gioco TicTacToe OX con multiplayer real-time, sistema di scommesse e pagamenti crypto.

## 🚀 Funzionalità

- **Autenticazione** JWT con registrazione/login
- **Multiplayer Real-time** via Socket.IO
- **Matchmaking Pubblico** - trova avversari automaticamente
- **Lobby Private** - gioca con amici tramite PIN
- **Sistema Scommesse** - partite FUN gratuite o CASH con soldi veri
- **Pagamenti Crypto** - depositi/prelievi in BTC, ETH, USDT, etc.
- **Sistema Amici** - aggiungi amici tramite ID univoco
- **Daily Bonus** - 50 monete FUN ogni 24 ore

---

## 📋 Requisiti

- Node.js 18+ 
- MongoDB (locale o MongoDB Atlas)
- Account NOWPayments.io (per pagamenti crypto reali)

---

## 🛠️ Installazione Locale

### 1. Clona e installa dipendenze

```bash
cd backend
npm install
```

### 2. Configura le variabili d'ambiente

```bash
cp .env.example .env
```

Modifica il file `.env`:

```env
# Obbligatorio
PORT=3000
MONGODB_URI=mongodb://localhost:27017/tictactoe_ox
JWT_SECRET=genera_una_stringa_random_sicura_qui

# Per pagamenti crypto reali (opzionale per sviluppo)
NOWPAYMENTS_API_KEY=tua_api_key
NOWPAYMENTS_IPN_SECRET=tuo_ipn_secret

# Bonus giornaliero
DAILY_FUN_BONUS=50

# Admin
ADMIN_SECRET=una_chiave_segreta_admin
```

### 3. Avvia MongoDB (se locale)

```bash
# Ubuntu/Debian
sudo systemctl start mongod

# macOS con Homebrew
brew services start mongodb-community
```

### 4. Avvia il server

```bash
# Sviluppo (con hot reload)
npm run dev

# Produzione
npm start
```

Il server sarà disponibile su `http://localhost:3000`

---

## ☁️ Deploy su Railway (Consigliato)

[Railway](https://railway.app) offre deploy facile con MongoDB incluso.

### 1. Crea account su railway.app

### 2. Nuovo progetto

1. Clicca **"New Project"**
2. Seleziona **"Deploy from GitHub repo"**
3. Connetti il tuo repo

### 3. Aggiungi MongoDB

1. Clicca **"+ New"** → **"Database"** → **"MongoDB"**
2. Railway creerà automaticamente `MONGODB_URI`

### 4. Configura variabili

Vai su **Variables** e aggiungi:

```
JWT_SECRET=tua_chiave_segreta
NOWPAYMENTS_API_KEY=xxx (se hai pagamenti crypto)
NOWPAYMENTS_IPN_SECRET=xxx
DAILY_FUN_BONUS=50
ADMIN_SECRET=xxx
```

### 5. Deploy automatico

Railway builderà e deployerà automaticamente. Ottieni l'URL del tipo:
`https://tictactoe-ox-backend-production.up.railway.app`

---

## ☁️ Deploy su Render

### 1. Crea account su render.com

### 2. Nuovo Web Service

1. **New** → **Web Service**
2. Connetti GitHub repo
3. Configura:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

### 3. Aggiungi MongoDB Atlas

1. Vai su [mongodb.com/atlas](https://mongodb.com/atlas)
2. Crea cluster gratuito
3. Ottieni connection string
4. Aggiungi a Render Environment

---

## 💳 Configurare Pagamenti Crypto (NOWPayments)

### 1. Registrati su [nowpayments.io](https://nowpayments.io)

### 2. Ottieni API Keys

1. Dashboard → **Store Settings** → **API Keys**
2. Copia `API Key`
3. Genera `IPN Secret` per i webhook

### 3. Configura Webhook URL

In NOWPayments Dashboard:
- **IPN Callback URL**: `https://tuo-server.com/api/wallet/webhook/nowpayments`

### 4. Crypto Supportate

| Crypto | Codice | Network |
|--------|--------|---------|
| Bitcoin | BTC | Bitcoin |
| Ethereum | ETH | ERC20 |
| USDT | USDTTRC20 | Tron TRC20 |
| USDT | USDTERC20 | Ethereum ERC20 |
| USD Coin | USDC | ERC20 |
| Litecoin | LTC | Litecoin |

---

## 🔌 API Endpoints

### Autenticazione

```
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
```

### Utente

```
GET  /api/user/profile
GET  /api/user/stats
GET  /api/user/search/:odint_id
```

### Wallet

```
GET  /api/wallet/balance
POST /api/wallet/check-in
POST /api/wallet/deposit
GET  /api/wallet/deposit/:paymentId/status
POST /api/wallet/withdraw
GET  /api/wallet/crypto/currencies
```

### Amici

```
GET  /api/friends
POST /api/friends/request/:odint_id
POST /api/friends/accept/:odint_id
POST /api/friends/reject/:odint_id
DELETE /api/friends/:odint_id
```

### Partite

```
GET  /api/games/history
GET  /api/games/:game_id
```

---

## 🔌 Socket.IO Events

### Client → Server

| Event | Data | Descrizione |
|-------|------|-------------|
| `search_match` | `{ game_type, bet_amount }` | Cerca partita |
| `cancel_search` | - | Annulla ricerca |
| `create_private_lobby` | `{ pin, game_type, bet_amount }` | Crea lobby privata |
| `join_private_lobby` | `{ pin }` | Unisciti a lobby |
| `leave_private_lobby` | - | Esci da lobby |
| `make_move` | `{ game_id, position }` | Fai mossa (0-8) |
| `leave_game` | `{ game_id }` | Abbandona partita |

### Server → Client

| Event | Data | Descrizione |
|-------|------|-------------|
| `message` | `string` | Messaggio informativo |
| `error_message` | `string` | Errore |
| `match_found` | `Game` | Partita trovata |
| `game_update` | `Game` | Aggiornamento stato |
| `game_end` | `Game` | Fine partita |
| `opponent_left` | - | Avversario disconnesso |

### Connessione con Auth

```javascript
const socket = io('wss://tuo-server.com', {
  auth: { token: 'jwt_token_here' },
  query: { userId: 'odint_id' }
});
```

---

## 🧪 Test Locali

### Test Health Check

```bash
curl http://localhost:3000/health
```

### Test Registrazione

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"odint_username":"testuser","email":"test@test.com","password":"password123"}'
```

### Conferma Deposito Manuale (Admin)

```bash
curl -X POST http://localhost:3000/api/wallet/admin/confirm-deposit \
  -H "Content-Type: application/json" \
  -d '{"admin_secret":"tua_admin_secret","user_id":"ABC12345","amount":50}'
```

---

## 📁 Struttura Progetto

```
backend/
├── src/
│   ├── middleware/
│   │   └── auth.js          # JWT middleware
│   ├── models/
│   │   ├── User.js          # Schema utente
│   │   └── Game.js          # Schema partita
│   ├── routes/
│   │   ├── auth.js          # Login/Register
│   │   ├── user.js          # Profilo utente
│   │   ├── friends.js       # Sistema amici
│   │   ├── wallet.js        # Saldi e pagamenti
│   │   └── games.js         # Storico partite
│   ├── services/
│   │   └── cryptoPayments.js # Integrazione NOWPayments
│   ├── socket/
│   │   └── gameSocket.js    # Real-time multiplayer
│   └── server.js            # Entry point
├── .env.example
├── package.json
└── README.md
```

---

## 🔒 Sicurezza

- ✅ Password hashate con bcrypt
- ✅ JWT per autenticazione
- ✅ Verifica firma webhook IPN
- ✅ Rate limiting (configurabile)
- ✅ CORS configurabile
- ⚠️ In produzione usa HTTPS!

---

## 📞 Supporto

Per domande o problemi:
1. Apri una Issue su GitHub
2. Contatta il developer

---

## 📄 Licenza

MIT License
