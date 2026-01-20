const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const gameSchema = new mongoose.Schema({
  game_id: {
    type: String,
    unique: true,
    default: () => uuidv4(),
  },
  player1_id: {
    type: String,
    required: true,
  },
  player2_id: {
    type: String,
    default: '',
  },
  player1_username: String,
  player2_username: String,
  game_type: {
    type: String,
    enum: ['fun', 'cash'],
    default: 'fun',
  },
  bet_amount: {
    type: Number,
    default: 0,
  },
  board: {
    type: [String],
    default: ['', '', '', '', '', '', '', '', ''],
  },
  current_turn: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    enum: ['waiting', 'playing', 'finished'],
    default: 'waiting',
  },
  winner_id: {
    type: String,
    default: null,
  },
  private_pin: {
    type: String,
    default: null,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  finished_at: {
    type: Date,
    default: null,
  },
});

// Check for winner
gameSchema.methods.checkWinner = function() {
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
    [0, 4, 8], [2, 4, 6], // Diagonals
  ];

  for (const pattern of winPatterns) {
    const [a, b, c] = pattern;
    if (
      this.board[a] &&
      this.board[a] === this.board[b] &&
      this.board[a] === this.board[c]
    ) {
      return this.board[a] === 'X' ? this.player1_id : this.player2_id;
    }
  }

  // Check for draw
  if (this.board.every(cell => cell !== '')) {
    return 'draw';
  }

  return null;
};

gameSchema.methods.toJSON = function() {
  return {
    game_id: this.game_id,
    player1_id: this.player1_id,
    player2_id: this.player2_id,
    player1_username: this.player1_username,
    player2_username: this.player2_username,
    game_type: this.game_type,
    bet_amount: this.bet_amount,
    board: this.board,
    current_turn: this.current_turn,
    status: this.status,
    winner_id: this.winner_id,
    private_pin: this.private_pin,
    created_at: this.created_at,
    finished_at: this.finished_at,
  };
};

module.exports = mongoose.model('Game', gameSchema);
