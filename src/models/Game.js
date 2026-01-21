const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  game_id: {
    type: String,
    unique: true,
    sparse: true
  },
  code: {
    type: String,
    sparse: true
  },
  player1: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  player2: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  stake: {
    type: Number,
    required: true,
    enum: [5, 10, 15, 20, 25, 50]
  },
  balance_type: {
    type: String,
    required: true,
    enum: ['fun', 'real']
  },
  status: {
    type: String,
    enum: ['waiting', 'playing', 'finished'],
    default: 'waiting'
  },
  is_public: {
    type: Boolean,
    default: false
  },
  board: {
    type: [String],
    default: [null, null, null, null, null, null, null, null, null]
  },
  current_turn: {
    type: String,
    enum: ['X', 'O'],
    default: 'X'
  },
  winner: {
    type: String,
    enum: ['X', 'O', null],
    default: null
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

// Indice per ricerca partite pubbliche
gameSchema.index({ status: 1, is_public: 1, stake: 1, balance_type: 1 });

module.exports = mongoose.model('Game', gameSchema);
