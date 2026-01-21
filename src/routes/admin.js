const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Game = require('../models/Game');
const Deposit = require('../models/Deposit');
const Friendship = require('../models/Friendship');
const walletService = require('../services/walletService');

// Admin password (in production, use environment variable)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TicTacAdmin2026!';

// Middleware auth admin
const adminAuth = (req, res, next) => {
  const authHeader = req.headers['x-admin-password'];
  if (!authHeader || authHeader !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Password admin non valida' });
  }
  next();
};

// ==================== DASHBOARD ====================
router.get('/dashboard', adminAuth, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalGames = await Game.countDocuments();
    const activeGames = await Game.countDocuments({ status: { $in: ['waiting', 'playing'] } });
    const totalDeposits = await Deposit.countDocuments();
    
    // Calculate total balances
    const balanceAgg = await User.aggregate([
      { $group: { 
        _id: null, 
        totalFun: { $sum: '$fun_balance' },
        totalReal: { $sum: '$real_balance' }
      }}
    ]);
    
    // Hot wallet status
    let walletStatus = { address: 'N/A', balanceSats: 0 };
    try {
      walletStatus = await walletService.getWalletStatus();
    } catch (e) {}
    
    // Recent users (last 24h)
    const oneDayAgo = new Date(Date.now() - 24*60*60*1000);
    const newUsers24h = await User.countDocuments({ createdAt: { $gte: oneDayAgo } });
    
    // Games by status
    const gamesByStatus = await Game.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    res.json({
      success: true,
      stats: {
        users: {
          total: totalUsers,
          new24h: newUsers24h
        },
        games: {
          total: totalGames,
          active: activeGames,
          byStatus: gamesByStatus
        },
        balances: {
          totalFun: balanceAgg[0]?.totalFun || 0,
          totalReal: balanceAgg[0]?.totalReal || 0
        },
        wallet: walletStatus,
        deposits: totalDeposits
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== USERS ====================
router.get('/users', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '' } = req.query;
    const skip = (page - 1) * limit;
    
    let query = {};
    if (search) {
      query = {
        $or: [
          { username: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { odint_id: { $regex: search, $options: 'i' } }
        ]
      };
    }
    
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await User.countDocuments(query);
    
    res.json({
      success: true,
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/users/:id', adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ success: false, error: 'Utente non trovato' });
    
    // Get user's games
    const games = await Game.find({
      $or: [{ player1: user._id }, { player2: user._id }]
    }).sort({ createdAt: -1 }).limit(20);
    
    // Get user's friendships
    const friendships = await Friendship.find({
      $or: [{ requester: user._id }, { recipient: user._id }],
      status: 'accepted'
    }).populate('requester recipient', 'odint_username odint_id');
    
    res.json({ success: true, user, games, friendships });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/users/:id', adminAuth, async (req, res) => {
  try {
    const { fun_balance, real_balance, is_banned } = req.body;
    const updateData = {};
    
    if (fun_balance !== undefined) updateData.fun_balance = parseFloat(fun_balance);
    if (real_balance !== undefined) updateData.real_balance = parseFloat(real_balance);
    if (is_banned !== undefined) updateData.is_banned = is_banned;
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).select('-password');
    
    if (!user) return res.status(404).json({ success: false, error: 'Utente non trovato' });
    
    res.json({ success: true, user, message: 'Utente aggiornato' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/users/:id', adminAuth, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'Utente non trovato' });
    
    // Also delete related data
    await Game.deleteMany({ $or: [{ player1: req.params.id }, { player2: req.params.id }] });
    await Friendship.deleteMany({ $or: [{ requester: req.params.id }, { recipient: req.params.id }] });
    
    res.json({ success: true, message: 'Utente eliminato' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== GAMES ====================
router.get('/games', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 50, status = '' } = req.query;
    const skip = (page - 1) * limit;
    
    let query = {};
    if (status) query.status = status;
    
    const games = await Game.find(query)
      .populate('player1 player2 winner', 'odint_username odint_id')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Game.countDocuments(query);
    
    res.json({
      success: true,
      games,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/games/:id', adminAuth, async (req, res) => {
  try {
    const game = await Game.findByIdAndDelete(req.params.id);
    if (!game) return res.status(404).json({ success: false, error: 'Partita non trovata' });
    res.json({ success: true, message: 'Partita eliminata' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Force end a game
router.post('/games/:id/end', adminAuth, async (req, res) => {
  try {
    const { winner_id } = req.body;
    const game = await Game.findById(req.params.id);
    if (!game) return res.status(404).json({ success: false, error: 'Partita non trovata' });
    
    game.status = 'finished';
    if (winner_id) game.winner = winner_id;
    await game.save();
    
    res.json({ success: true, message: 'Partita terminata', game });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== DEPOSITS ====================
router.get('/deposits', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;
    
    const deposits = await Deposit.find()
      .populate('user', 'odint_username odint_id email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Deposit.countDocuments();
    
    res.json({
      success: true,
      deposits,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== WALLET ====================
router.get('/wallet/status', adminAuth, async (req, res) => {
  try {
    const status = await walletService.getWalletStatus();
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== SETTINGS ====================
router.get('/settings', adminAuth, async (req, res) => {
  try {
    // Return current settings (from env or defaults)
    res.json({
      success: true,
      settings: {
        checkin_bonus: process.env.CHECKIN_BONUS || 50,
        min_withdrawal: process.env.MIN_WITHDRAWAL || 10,
        btc_rate_eur: process.env.BTC_RATE_EUR || 40000,
        stakes: [5, 10, 15, 20, 25, 50]
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== BROADCAST ====================
router.post('/broadcast', adminAuth, async (req, res) => {
  try {
    const { message, type = 'info' } = req.body;
    // In a real app, this would send push notifications or store in a messages collection
    // For now, just acknowledge
    res.json({ 
      success: true, 
      message: 'Messaggio broadcast ricevuto',
      broadcast: { message, type, timestamp: new Date() }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==================== STATS ====================
router.get('/stats/daily', adminAuth, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // Users per day
    const usersByDay = await User.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);
    
    // Games per day
    const gamesByDay = await Game.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      { $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);
    
    res.json({
      success: true,
      stats: {
        usersByDay,
        gamesByDay
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
