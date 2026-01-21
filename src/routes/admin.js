const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Game = require('../models/Game');
const Transaction = require('../models/Transaction');
const walletService = require('../services/walletService');

// Admin password (in production, use environment variable)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TicTacAdmin2026!';

// Admin auth middleware
const adminAuth = (req, res, next) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized - Invalid admin key' });
  }
  next();
};

// Apply admin auth to all routes
router.use(adminAuth);

// ==================== DASHBOARD ====================

// GET /api/admin/stats - Dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalGames = await Game.countDocuments();
    const activeGames = await Game.countDocuments({ status: 'playing' });
    const waitingGames = await Game.countDocuments({ status: 'waiting' });
    const finishedGames = await Game.countDocuments({ status: 'finished' });
    
    // Aggregate balances
    const balanceStats = await User.aggregate([
      {
        $group: {
          _id: null,
          totalFunBalance: { $sum: '$fun_balance' },
          totalRealBalance: { $sum: '$real_balance' },
          avgFunBalance: { $avg: '$fun_balance' },
          avgRealBalance: { $avg: '$real_balance' }
        }
      }
    ]);

    // Recent registrations (last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentUsers = await User.countDocuments({ createdAt: { $gte: oneDayAgo } });

    // Hot wallet status
    let walletStatus = { balance: 0, address: 'N/A' };
    try {
      const wallet = walletService.getWalletInfo();
      walletStatus = {
        address: wallet.address,
        balance: wallet.balance || 0
      };
    } catch (e) {
      console.log('Wallet service not available');
    }

    res.json({
      success: true,
      stats: {
        users: {
          total: totalUsers,
          recentSignups: recentUsers
        },
        games: {
          total: totalGames,
          active: activeGames,
          waiting: waitingGames,
          finished: finishedGames
        },
        balances: balanceStats[0] || {
          totalFunBalance: 0,
          totalRealBalance: 0,
          avgFunBalance: 0,
          avgRealBalance: 0
        },
        wallet: walletStatus
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== USERS ====================

// GET /api/admin/users - List all users
router.get('/users', async (req, res) => {
  try {
    const { search, sort = '-createdAt', limit = 50, skip = 0 } = req.query;
    
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
      .sort(sort)
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      users,
      total,
      limit: parseInt(limit),
      skip: parseInt(skip)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/users/:id - Get user details
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user's games
    const games = await Game.find({
      $or: [{ player1: user._id }, { player2: user._id }]
    }).sort('-createdAt').limit(20);

    // Get user's friends
    const friends = await User.find({
      _id: { $in: user.friends }
    }).select('username odint_id');

    res.json({
      success: true,
      user,
      games,
      friends
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/users/:id - Update user
router.put('/users/:id', async (req, res) => {
  try {
    const { fun_balance, real_balance, is_banned, is_admin, username, email } = req.body;
    
    const updateData = {};
    if (fun_balance !== undefined) updateData.fun_balance = fun_balance;
    if (real_balance !== undefined) updateData.real_balance = real_balance;
    if (is_banned !== undefined) updateData.is_banned = is_banned;
    if (is_admin !== undefined) updateData.is_admin = is_admin;
    if (username) updateData.username = username;
    if (email) updateData.email = email;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/users/:id/add-balance - Add balance to user
router.post('/users/:id/add-balance', async (req, res) => {
  try {
    const { type, amount, reason } = req.body;
    
    if (!type || !amount) {
      return res.status(400).json({ error: 'Type and amount required' });
    }

    const field = type === 'fun' ? 'fun_balance' : 'real_balance';
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $inc: { [field]: amount } },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Log the action
    console.log(`[ADMIN] Added ${amount} ${type} to user ${user.username} (${user.odint_id}). Reason: ${reason || 'N/A'}`);

    res.json({ 
      success: true, 
      user,
      message: `Added ${amount} ${type.toUpperCase()} to ${user.username}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/admin/users/:id - Delete user
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Also delete user's games
    await Game.deleteMany({
      $or: [{ player1: req.params.id }, { player2: req.params.id }]
    });

    res.json({ success: true, message: `User ${user.username} deleted` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== GAMES ====================

// GET /api/admin/games - List all games
router.get('/games', async (req, res) => {
  try {
    const { status, limit = 50, skip = 0 } = req.query;
    
    let query = {};
    if (status) query.status = status;

    const games = await Game.find(query)
      .populate('player1', 'username odint_id')
      .populate('player2', 'username odint_id')
      .populate('winner', 'username odint_id')
      .sort('-createdAt')
      .limit(parseInt(limit))
      .skip(parseInt(skip));

    const total = await Game.countDocuments(query);

    res.json({
      success: true,
      games,
      total
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/games/:id - Get game details
router.get('/games/:id', async (req, res) => {
  try {
    const game = await Game.findById(req.params.id)
      .populate('player1', 'username odint_id fun_balance real_balance')
      .populate('player2', 'username odint_id fun_balance real_balance')
      .populate('winner', 'username odint_id');

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    res.json({ success: true, game });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/games/:id - Update game (force end, change status)
router.put('/games/:id', async (req, res) => {
  try {
    const { status, winner } = req.body;
    
    const updateData = {};
    if (status) updateData.status = status;
    if (winner) updateData.winner = winner;

    const game = await Game.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate('player1 player2 winner', 'username odint_id');

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    res.json({ success: true, game });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/admin/games/:id - Delete game
router.delete('/games/:id', async (req, res) => {
  try {
    const game = await Game.findByIdAndDelete(req.params.id);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    res.json({ success: true, message: 'Game deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== WALLET ====================

// GET /api/admin/wallet - Hot wallet status
router.get('/wallet', async (req, res) => {
  try {
    const wallet = walletService.getWalletInfo();
    const balance = await walletService.checkBalance();
    
    res.json({
      success: true,
      wallet: {
        address: wallet.address,
        balance: balance,
        balanceBTC: (balance / 100000000).toFixed(8)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/transactions - List transactions
router.get('/transactions', async (req, res) => {
  try {
    const { type, status, limit = 50 } = req.query;
    
    let query = {};
    if (type) query.type = type;
    if (status) query.status = status;

    // If Transaction model exists
    let transactions = [];
    try {
      transactions = await Transaction.find(query)
        .populate('user', 'username odint_id')
        .sort('-createdAt')
        .limit(parseInt(limit));
    } catch (e) {
      // Transaction model might not exist
      transactions = [];
    }

    res.json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/wallet/send - Manual BTC send (emergency)
router.post('/wallet/send', async (req, res) => {
  try {
    const { toAddress, amountSats } = req.body;
    
    if (!toAddress || !amountSats) {
      return res.status(400).json({ error: 'toAddress and amountSats required' });
    }

    const result = await walletService.sendBitcoin(toAddress, amountSats);
    
    res.json({
      success: true,
      txHash: result.txHash,
      message: `Sent ${amountSats} sats to ${toAddress}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== SETTINGS ====================

// GET /api/admin/settings - Get app settings
router.get('/settings', async (req, res) => {
  try {
    // These could be stored in a Settings collection
    const settings = {
      checkin_bonus: parseInt(process.env.CHECKIN_BONUS) || 50,
      initial_fun_balance: parseInt(process.env.INITIAL_FUN_BALANCE) || 100,
      stakes: [5, 10, 15, 20, 25, 50],
      min_withdrawal: parseFloat(process.env.MIN_WITHDRAWAL) || 5,
      btc_rate: parseFloat(process.env.BTC_RATE) || 95000 // EUR per BTC
    };

    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== BROADCAST ====================

// POST /api/admin/broadcast - Send notification to all users (placeholder)
router.post('/broadcast', async (req, res) => {
  try {
    const { message, title } = req.body;
    
    // In a real app, this would send push notifications
    // For now, just log it
    console.log(`[BROADCAST] ${title}: ${message}`);
    
    const userCount = await User.countDocuments();
    
    res.json({
      success: true,
      message: `Broadcast queued for ${userCount} users`,
      content: { title, message }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
