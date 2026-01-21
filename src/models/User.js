const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const userSchema = new mongoose.Schema({
  odint_id: {
    type: String,
    unique: true,
    default: () => uuidv4().slice(0, 8).toUpperCase(),
  },
  odint_username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 20,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  fun_balance: {
    type: Number,
    default: 100,
  },
  real_balance: {
    type: Number,
    default: 0,
  },
  games_played: {
    type: Number,
    default: 0,
  },
  games_won: {
    type: Number,
    default: 0,
  },
  games_lost: {
    type: Number,
    default: 0,
  },
  games_draw: {
    type: Number,
    default: 0,
  },
  last_check_in: {
    type: Date,
    default: null,
  },
  friends: [{
    type: String, // odint_id of friends
  }],
  friend_requests: [{
    type: String, // odint_id of requesters
  }],
  deposit_index: {
    type: Number,
    unique: true,
    sparse: true,
    default: null
  },
  deposit_address: {
    type: String,
    unique: true,
    sparse: true,
    default: null
  },
  deposit_addresses: {
    type: Map,
    of: String,
    default: {},
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Get public profile (safe to send to client)
userSchema.methods.toPublicJSON = function() {
  return {
    odint_id: this.odint_id,
    odint_username: this.odint_username,
    email: this.email,
    fun_balance: this.fun_balance,
    real_balance: this.real_balance,
    games_played: this.games_played,
    games_won: this.games_won,
    games_lost: this.games_lost,
    games_draw: this.games_draw,
    last_check_in: this.last_check_in,
    friends: this.friends,
    friend_requests: this.friend_requests,
    created_at: this.created_at,
  };
};

module.exports = mongoose.model('User', userSchema);
