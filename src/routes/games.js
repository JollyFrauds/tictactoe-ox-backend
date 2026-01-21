const express = require('express');
const router = express.Router();
const { authMiddleware: auth } = require('../middleware/auth');
const User = require('../models/User');
const Game = require('../models/Game');

// Genera codice random a 6 cifre
function generateGameCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Crea partita privata
router.post('/create', auth, async (req, res) => {
  try {
    const { stake, balanceType, balance_type } = req.body; const bType = (balanceType || balance_type || '').toLowerCase();
    
    // Verifica stake valido
    const validStakes = [5, 10, 15, 20, 25, 50];
    if (!validStakes.includes(stake)) {
      return res.status(400).json({ success: false, message: 'Puntata non valida' });
    }
    
    // Verifica balance type
    if (!['fun', 'real'].includes(bType)) {
      return res.status(400).json({ success: false, message: 'Tipo di bilancio non valido' });
    }
    
    const user = await User.findById(req.userId);
    
    // Verifica saldo sufficiente
    const balance = bType === 'fun' ? user.fun_balance : user.real_balance;
    if (balance < stake) {
      return res.status(400).json({ success: false, message: 'Saldo insufficiente' });
    }
    
    // Genera codice unico
    let gameCode;
    let existingGame;
    do {
      gameCode = generateGameCode();
      existingGame = await Game.findOne({ code: gameCode, status: 'waiting' });
    } while (existingGame);
    
    // Crea la partita
    const game = new Game({
      code: gameCode,
      player1: req.userId,
      stake: parseInt(stake),
      balance_type: bType,
      status: 'waiting',
      board: Array(9).fill(null),
      current_turn: 'X'
    });
    
    await game.save();
    
    res.json({
      success: true,
      message: 'Partita creata',
      game: {
        id: game._id,
        code: gameCode,
        stake: parseInt(stake),
        balance_type: bType,
        status: 'waiting'
      }
    });
  } catch (error) {
    console.error('Create private game error:', error);
    res.status(500).json({ success: false, message: 'Errore del server' });
  }
});

// Unisciti a partita privata
router.post('/join', auth, async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code || code.length !== 6) {
      return res.status(400).json({ success: false, message: 'Codice non valido' });
    }
    
    const game = await Game.findOne({ code: code, status: 'waiting' });
    
    if (!game) {
      return res.status(404).json({ success: false, message: 'Partita non trovata o già iniziata' });
    }
    
    if (game.player1.toString() === req.userId) {
      return res.status(400).json({ success: false, message: 'Non puoi unirti alla tua partita' });
    }
    
    const user = await User.findById(req.userId);
    
    // Verifica saldo sufficiente
    const balance = game.balance_type === 'fun' ? user.fun_balance : user.real_balance;
    if (balance < game.stake) {
      return res.status(400).json({ success: false, message: 'Saldo insufficiente' });
    }
    
    // Aggiorna la partita
    game.player2 = req.userId;
    game.status = 'playing';
    await game.save();
    
    // Blocca i fondi di entrambi i giocatori
    const player1 = await User.findById(game.player1);
    if (game.balance_type === 'fun') {
      player1.fun_balance -= game.stake;
      user.fun_balance -= game.stake;
    } else {
      player1.real_balance -= game.stake;
      user.real_balance -= game.stake;
    }
    await player1.save();
    await user.save();
    
    res.json({
      success: true,
      message: 'Partita iniziata!',
      game: {
        id: game._id,
        stake: game.stake,
        balanceType: game.balance_type,
        status: 'playing',
        board: game.board,
        currentTurn: game.current_turn,
        yourSymbol: 'O'
      }
    });
  } catch (error) {
    console.error('Join private game error:', error);
    res.status(500).json({ success: false, message: 'Errore del server' });
  }
});

// Cerca partita pubblica (matchmaking)
// Alias per compatibilit
router.post('/matchmaking', auth, async (req, res) => {
  try {
    const { stake, balanceType, balance_type } = req.body; const bType = (balanceType || balance_type || '').toLowerCase();
    
    // Verifica stake valido
    const validStakes = [5, 10, 15, 20, 25, 50];
    if (!validStakes.includes(stake)) {
      return res.status(400).json({ success: false, message: 'Puntata non valida' });
    }
    
    const user = await User.findById(req.userId);
    
    // Verifica saldo sufficiente
    const balance = bType === 'fun' ? user.fun_balance : user.real_balance;
    if (balance < stake) {
      return res.status(400).json({ success: false, message: 'Saldo insufficiente' });
    }
    
    // Cerca partita esistente con stesso stake
    let game = await Game.findOne({
      stake: parseInt(stake),
      balance_type: bType,
      status: 'waiting',
      is_public: true,
      player1: { $ne: req.userId }
    });
    
    if (game) {
      // Trovato avversario - unisciti
      game.player2 = req.userId;
      game.status = 'playing';
      await game.save();
      
      // Blocca i fondi
      const player1 = await User.findById(game.player1);
      if (game.balance_type === 'fun') {
        player1.fun_balance -= game.stake;
        user.fun_balance -= game.stake;
      } else {
        player1.real_balance -= game.stake;
        user.real_balance -= game.stake;
      }
      await player1.save();
      await user.save();
      
      return res.json({
        success: true,
        matched: true,
        message: 'Avversario trovato!',
        game: {
          id: game._id,
          stake: game.stake,
          status: 'playing',
          yourSymbol: 'O'
        }
      });
    } else {
      // Nessun avversario - crea partita pubblica
      game = new Game({
        player1: req.userId,
        stake: parseInt(stake),
        balance_type: bType,
        status: 'waiting',
        is_public: true,
        board: Array(9).fill(null),
        current_turn: 'X'
      });
      await game.save();
      
      return res.json({
        success: true,
        matched: false,
        message: 'In attesa di un avversario...',
        game: {
          id: game._id,
          stake: game.stake,
          status: 'waiting',
          yourSymbol: 'X'
        }
      });
    }
  } catch (error) {
    console.error('Find match error:', error);
    res.status(500).json({ success: false, message: 'Errore del server' });
  }
});

// Controlla stato partita
router.get('/status/:gameId', auth, async (req, res) => {
  try {
    const game = await Game.findById(req.params.gameId)
      .populate('player1', 'odint_username')
      .populate('player2', 'odint_username');
    
    if (!game) {
      return res.status(404).json({ success: false, message: 'Partita non trovata' });
    }
    
    const isPlayer1 = game.player1._id.toString() === req.userId;
    const isPlayer2 = game.player2 && game.player2._id.toString() === req.userId;
    
    if (!isPlayer1 && !isPlayer2) {
      return res.status(403).json({ success: false, message: 'Non sei un giocatore di questa partita' });
    }
    
    res.json({
      success: true,
      game: {
        id: game._id,
        status: game.status,
        board: game.board,
        currentTurn: game.current_turn,
        yourSymbol: isPlayer1 ? 'X' : 'O',
        opponent: isPlayer1 ? game.player2?.odint_username : game.player1.odint_username,
        winner: game.winner,
        stake: game.stake
      }
    });
  } catch (error) {
    console.error('Game status error:', error);
    res.status(500).json({ success: false, message: 'Errore del server' });
  }
});

// Fai una mossa
router.post('/move', auth, async (req, res) => {
  try {
    const { gameId, position } = req.body;
    
    if (position < 0 || position > 8) {
      return res.status(400).json({ success: false, message: 'Posizione non valida' });
    }
    
    const game = await Game.findById(gameId);
    
    if (!game) {
      return res.status(404).json({ success: false, message: 'Partita non trovata' });
    }
    
    if (game.status !== 'playing') {
      return res.status(400).json({ success: false, message: 'Partita non in corso' });
    }
    
    const isPlayer1 = game.player1.toString() === req.userId;
    const isPlayer2 = game.player2.toString() === req.userId;
    
    if (!isPlayer1 && !isPlayer2) {
      return res.status(403).json({ success: false, message: 'Non sei un giocatore' });
    }
    
    const playerSymbol = isPlayer1 ? 'X' : 'O';
    
    if (game.current_turn !== playerSymbol) {
      return res.status(400).json({ success: false, message: 'Non è il tuo turno' });
    }
    
    if (game.board[position] !== null) {
      return res.status(400).json({ success: false, message: 'Casella già occupata' });
    }
    
    // Fai la mossa
    game.board[position] = playerSymbol;
    game.current_turn = playerSymbol === 'X' ? 'O' : 'X';
    
    // Controlla vittoria
    const winPatterns = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], // righe
      [0, 3, 6], [1, 4, 7], [2, 5, 8], // colonne
      [0, 4, 8], [2, 4, 6] // diagonali
    ];
    
    let winner = null;
    for (const pattern of winPatterns) {
      const [a, b, c] = pattern;
      if (game.board[a] && game.board[a] === game.board[b] && game.board[a] === game.board[c]) {
        winner = game.board[a];
        break;
      }
    }
    
    // Controlla pareggio
    const isDraw = !winner && game.board.every(cell => cell !== null);
    
    if (winner || isDraw) {
      game.status = 'finished';
      game.winner = winner;
      
      // Distribuisci le vincite
      const pot = game.stake * 2;
      const player1 = await User.findById(game.player1);
      const player2 = await User.findById(game.player2);
      
      if (isDraw) {
        // Restituisci le puntate
        if (game.balance_type === 'fun') {
          player1.fun_balance += game.stake;
          player2.fun_balance += game.stake;
        } else {
          player1.real_balance += game.stake;
          player2.real_balance += game.stake;
        }
      } else {
        // Dai tutto al vincitore
        const winnerUser = winner === 'X' ? player1 : player2;
        if (game.balance_type === 'fun') {
          winnerUser.fun_balance += pot;
        } else {
          winnerUser.real_balance += pot;
        }
      }
      
      await player1.save();
      await player2.save();
    }
    
    await game.save();
    
    res.json({
      success: true,
      game: {
        board: game.board,
        currentTurn: game.current_turn,
        status: game.status,
        winner: game.winner
      }
    });
  } catch (error) {
    console.error('Move error:', error);
    res.status(500).json({ success: false, message: 'Errore del server' });
  }
});

// Annulla ricerca partita
router.post('/cancel-search', auth, async (req, res) => {
  try {
    const { gameId } = req.body;
    
    const game = await Game.findById(gameId);
    
    if (!game) {
      return res.status(404).json({ success: false, message: 'Partita non trovata' });
    }
    
    if (game.player1.toString() !== req.userId) {
      return res.status(403).json({ success: false, message: 'Non autorizzato' });
    }
    
    if (game.status !== 'waiting') {
      return res.status(400).json({ success: false, message: 'Partita già iniziata' });
    }
    
    await Game.findByIdAndDelete(gameId);
    
    res.json({ success: true, message: 'Ricerca annullata' });
  } catch (error) {
    console.error('Cancel search error:', error);
    res.status(500).json({ success: false, message: 'Errore del server' });
  }
});

module.exports = router;
