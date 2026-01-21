const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['deposit', 'withdrawal'],
    required: true
  },
  status: {
    type: String,
    enum: ['awaiting', 'pending', 'confirmed', 'failed'],
    default: 'awaiting'
  },
  amount_btc: {
    type: Number,
    required: true
  },
  amount_eur: {
    type: Number,
    required: true
  },
  txid: {
    type: String,
    default: ''
  },
  address: {
    type: String,
    required: true
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

// Update timestamp on save
transactionSchema.pre('save', function(next) {
  this.updated_at = Date.now();
  next();
});

module.exports = mongoose.model('Transaction', transactionSchema);
