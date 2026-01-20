const mongoose = require('mongoose');

const depositSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  payment_id: {
    type: String,
    required: true,
    unique: true
  },
  amount_eur: {
    type: Number,
    required: true
  },
  amount_crypto: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    required: true
  },
  address: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending'
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

depositSchema.index({ user: 1, created_at: -1 });
depositSchema.index({ payment_id: 1 });

module.exports = mongoose.model('Deposit', depositSchema);
