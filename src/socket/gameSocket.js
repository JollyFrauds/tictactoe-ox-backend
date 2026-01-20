const Game = require('../models/Game');
const User = require('../models/User');
const { verifyToken } = require('../middleware/auth');

// Store for matchmaking and active connections
const connectedUsers = new Map(); // odint_id -> socketId
const matchmakingQueue = {
  fun: [],
  cash: new Map(), // betAmount -> [users]
};
const privateLobbies = new Map(); // pin -> game
const activeGames = new Map(); // gameId -> game

const PLATFORM_FEE_PERCENT = 5;

const setupSocketHandlers = (io) => {
  io.on('connection', async (socket) => {
    console.log('📱 New connection:', socket.id);

    let currentUser = null;

    // Authenticate user
    const { token } = socket.handshake.auth;
    const { userId } = socket.handshake.query;

    if (token) {
      try {
        const decoded = verifyToken(token);
        if (decoded) {
          currentUser = await User.findById(decoded.userId);
          if (currentUser) {
            connectedUsers.set(currentUser.odint_id, socket.id);
            console.log(`✅ User authenticated: ${currentUser.odint_username}`);
          }
        }
      } catch (error) {
        console.error('Auth error:', error);
      }
    }

    // ==================== MATCHMAKING ====================

    socket.on('search_match', async (data) => {
      if (!currentUser) return socket.emit('error_message', 'Non autenticato');

      const { game_type, bet_amount } = data;
      const isCash = game_type === 'cash';

      // Check balance for cash games
      if (isCash) {
        if (currentUser.real_balance < bet_amount) {
          return socket.emit('error_message', 'Saldo insufficiente');
        }
      }

      const queueEntry = {
        odintId: currentUser.odint_id,
        username: currentUser.odint_username,
        socketId: socket.id,
        betAmount: bet_amount || 0,
      };

      if (isCash) {
        // Cash game matching (by bet amount)
        const betQueue = matchmakingQueue.cash.get(bet_amount) || [];
        
        // Look for opponent with same bet amount
        const opponentIndex = betQueue.findIndex(p => p.odintId !== currentUser.odint_id);
        
        if (opponentIndex !== -1) {
          const opponent = betQueue.splice(opponentIndex, 1)[0];
          matchmakingQueue.cash.set(bet_amount, betQueue);
          
          // Create game
          await createGame(socket, io, currentUser, opponent, 'cash', bet_amount);
        } else {
          // Add to queue
          betQueue.push(queueEntry);
          matchmakingQueue.cash.set(bet_amount, betQueue);
          socket.emit('message', 'Cercando avversario...');
        }
      } else {
        // Fun game matching
        const opponent = matchmakingQueue.fun.find(p => p.odintId !== currentUser.odint_id);
        
        if (opponent) {
          matchmakingQueue.fun = matchmakingQueue.fun.filter(p => p.odintId !== opponent.odintId);
          await createGame(socket, io, currentUser, opponent, 'fun', 0);
        } else {
          // Remove if already in queue, then add
          matchmakingQueue.fun = matchmakingQueue.fun.filter(p => p.odintId !== currentUser.odint_id);
          matchmakingQueue.fun.push(queueEntry);
          socket.emit('message', 'Cercando avversario...');
        }
      }
    });

    socket.on('cancel_search', () => {
      if (!currentUser) return;
      
      // Remove from all queues
      matchmakingQueue.fun = matchmakingQueue.fun.filter(p => p.odintId !== currentUser.odint_id);
      matchmakingQueue.cash.forEach((queue, amount) => {
        matchmakingQueue.cash.set(amount, queue.filter(p => p.odintId !== currentUser.odint_id));
      });
      
      socket.emit('message', 'Ricerca annullata');
    });

    // ==================== PRIVATE LOBBY ====================

    socket.on('create_private_lobby', async (data) => {
      if (!currentUser) return socket.emit('error_message', 'Non autenticato');

      const { pin, game_type, bet_amount } = data;
      const isCash = game_type === 'cash';

      if (isCash && currentUser.real_balance < bet_amount) {
        return socket.emit('error_message', 'Saldo insufficiente');
      }

      if (privateLobbies.has(pin)) {
        return socket.emit('error_message', 'PIN già in uso');
      }

      const lobby = {
        pin,
        host: {
          odintId: currentUser.odint_id,
          username: currentUser.odint_username,
          socketId: socket.id,
        },
        gameType: game_type,
        betAmount: bet_amount || 0,
      };

      privateLobbies.set(pin, lobby);
      socket.join(`lobby_${pin}`);
      socket.emit('message', 'Lobby creata, in attesa dell\'avversario...');
    });

    socket.on('join_private_lobby', async (data) => {
      if (!currentUser) return socket.emit('error_message', 'Non autenticato');

      const { pin } = data;
      const lobby = privateLobbies.get(pin);

      if (!lobby) {
        return socket.emit('error_message', 'Lobby non trovata');
      }

      if (lobby.host.odintId === currentUser.odint_id) {
        return socket.emit('error_message', 'Non puoi unirti alla tua lobby');
      }

      if (lobby.gameType === 'cash' && currentUser.real_balance < lobby.betAmount) {
        return socket.emit('error_message', 'Saldo insufficiente');
      }

      // Remove lobby and create game
      privateLobbies.delete(pin);

      const opponent = {
        odintId: currentUser.odint_id,
        username: currentUser.odint_username,
        socketId: socket.id,
        betAmount: lobby.betAmount,
      };

      const hostSocket = io.sockets.sockets.get(lobby.host.socketId);
      const hostUser = await User.findOne({ odint_id: lobby.host.odintId });

      if (hostSocket && hostUser) {
        await createGame(hostSocket, io, hostUser, opponent, lobby.gameType, lobby.betAmount, pin);
      }
    });

    socket.on('leave_private_lobby', () => {
      if (!currentUser) return;
      
      privateLobbies.forEach((lobby, pin) => {
        if (lobby.host.odintId === currentUser.odint_id) {
          privateLobbies.delete(pin);
        }
      });
    });

    // ==================== GAME ACTIONS ====================

    socket.on('make_move', async (data) => {
      if (!currentUser) return;

      const { game_id, position } = data;
      const game = activeGames.get(game_id);

      if (!game) return socket.emit('error_message', 'Partita non trovata');
      if (game.status !== 'playing') return;
      if (game.current_turn !== currentUser.odint_id) {
        return socket.emit('error_message', 'Non è il tuo turno');
      }
      if (game.board[position] !== '') {
        return socket.emit('error_message', 'Posizione già occupata');
      }

      // Make move
      const symbol = game.player1_id === currentUser.odint_id ? 'X' : 'O';
      game.board[position] = symbol;

      // Check for winner
      const result = checkWinner(game.board);

      if (result) {
        game.status = 'finished';
        game.finished_at = new Date();

        if (result === 'draw') {
          game.winner_id = null;
          await handleGameEnd(io, game, 'draw');
        } else {
          game.winner_id = result === 'X' ? game.player1_id : game.player2_id;
          await handleGameEnd(io, game, 'win');
        }
      } else {
        // Switch turn
        game.current_turn = game.current_turn === game.player1_id
          ? game.player2_id
          : game.player1_id;
      }

      // Save to database
      await Game.findOneAndUpdate({ game_id }, game);
      activeGames.set(game_id, game);

      // Broadcast update
      io.to(`game_${game_id}`).emit(
        game.status === 'finished' ? 'game_end' : 'game_update',
        game
      );
    });

    socket.on('leave_game', async (data) => {
      if (!currentUser) return;

      const { game_id } = data;
      const game = activeGames.get(game_id);

      if (!game) return;

      // If game is still playing, forfeit
      if (game.status === 'playing') {
        game.status = 'finished';
        game.finished_at = new Date();
        game.winner_id = game.player1_id === currentUser.odint_id
          ? game.player2_id
          : game.player1_id;

        await handleGameEnd(io, game, 'forfeit');
        await Game.findOneAndUpdate({ game_id }, game);
        
        io.to(`game_${game_id}`).emit('opponent_left');
        io.to(`game_${game_id}`).emit('game_end', game);
      }

      socket.leave(`game_${game_id}`);
      activeGames.delete(game_id);
    });

    // ==================== DISCONNECT ====================

    socket.on('disconnect', async () => {
      if (currentUser) {
        connectedUsers.delete(currentUser.odint_id);
        
        // Remove from matchmaking
        matchmakingQueue.fun = matchmakingQueue.fun.filter(
          p => p.odintId !== currentUser.odint_id
        );
        matchmakingQueue.cash.forEach((queue, amount) => {
          matchmakingQueue.cash.set(amount,
            queue.filter(p => p.odintId !== currentUser.odint_id)
          );
        });

        // Clean up private lobbies
        privateLobbies.forEach((lobby, pin) => {
          if (lobby.host.odintId === currentUser.odint_id) {
            privateLobbies.delete(pin);
          }
        });

        console.log(`👋 User disconnected: ${currentUser.odint_username}`);
      }
    });
  });
};

// Helper function to create a game
async function createGame(socket, io, player1, player2, gameType, betAmount, privatePin = null) {
  const game = new Game({
    player1_id: player1.odint_id,
    player2_id: player2.odintId,
    player1_username: player1.odint_username,
    player2_username: player2.username,
    game_type: gameType,
    bet_amount: betAmount,
    current_turn: player1.odint_id, // Player 1 (X) goes first
    status: 'playing',
    private_pin: privatePin,
  });

  await game.save();
  activeGames.set(game.game_id, game.toJSON());

  // Deduct balance for cash games
  if (gameType === 'cash' && betAmount > 0) {
    await User.findOneAndUpdate(
      { odint_id: player1.odint_id },
      { $inc: { real_balance: -betAmount } }
    );
    await User.findOneAndUpdate(
      { odint_id: player2.odintId },
      { $inc: { real_balance: -betAmount } }
    );
  }

  // Join both players to game room
  socket.join(`game_${game.game_id}`);
  const player2Socket = io.sockets.sockets.get(player2.socketId);
  if (player2Socket) {
    player2Socket.join(`game_${game.game_id}`);
  }

  // Notify both players
  io.to(`game_${game.game_id}`).emit('match_found', game.toJSON());

  console.log(`🎮 Game started: ${player1.odint_username} vs ${player2.username}`);
}

// Check for winner
function checkWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
    [0, 4, 8], [2, 4, 6], // Diagonals
  ];

  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a]; // 'X' or 'O'
    }
  }

  // Check for draw
  if (board.every(cell => cell !== '')) {
    return 'draw';
  }

  return null;
}

// Handle game end (update stats and balances)
async function handleGameEnd(io, game, result) {
  const player1 = await User.findOne({ odint_id: game.player1_id });
  const player2 = await User.findOne({ odint_id: game.player2_id });

  if (!player1 || !player2) return;

  // Update game stats
  player1.games_played += 1;
  player2.games_played += 1;

  if (result === 'draw') {
    player1.games_draw += 1;
    player2.games_draw += 1;

    // Refund bets for cash games
    if (game.game_type === 'cash') {
      player1.real_balance += game.bet_amount;
      player2.real_balance += game.bet_amount;
    }
  } else {
    const winner = game.winner_id === player1.odint_id ? player1 : player2;
    const loser = game.winner_id === player1.odint_id ? player2 : player1;

    winner.games_won += 1;
    loser.games_lost += 1;

    // Award winnings for cash games
    if (game.game_type === 'cash') {
      const totalPot = game.bet_amount * 2;
      const platformFee = totalPot * (PLATFORM_FEE_PERCENT / 100);
      const winnings = totalPot - platformFee;
      winner.real_balance += winnings;
    }
  }

  await player1.save();
  await player2.save();
}

module.exports = setupSocketHandlers;
