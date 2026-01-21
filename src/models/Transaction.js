const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['deposit', 'withdrawal'],
    required: true
  },
  amount_eur: {
    type: Number,
    required: true
  },
  amount_btc: {
    type: Number,
    default: 0
  },
  wallet_address: {
    type: String,
    required: true
  },
  tx_hash: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['awaiting', 'pending', 'confirmed', 'failed'],
    default: 'awaiting'
  },
  confirmations: {
    type: Number,
    default: 0
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Transaction', transactionSchema);
