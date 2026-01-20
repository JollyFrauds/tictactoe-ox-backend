const express = require('express');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const DAILY_BONUS = 50;

// Get current user
router.get('/me', authMiddleware, async (req, res) => {
  try {
    res.json({
      success: true,
      user: req.user.toPublicJSON(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Errore nel recupero utente',
    });
  }
});

// Daily check-in
router.post('/checkin', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    const now = new Date();
    const lastMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Check if already claimed today
    if (user.last_check_in && user.last_check_in >= lastMidnight) {
      return res.status(400).json({
        success: false,
        message: 'Hai già riscattato il bonus oggi',
      });
    }

    // Give bonus
    user.fun_balance += DAILY_BONUS;
    user.last_check_in = now;
    await user.save();

    res.json({
      success: true,
      message: `Hai ricevuto ${DAILY_BONUS} FUN coins!`,
      bonus: DAILY_BONUS,
      user: user.toPublicJSON(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Errore nel check-in',
    });
  }
});

// Get user stats
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    const winRate = user.games_played > 0
      ? ((user.games_won / user.games_played) * 100).toFixed(1)
      : 0;

    res.json({
      success: true,
      stats: {
        games_played: user.games_played,
        games_won: user.games_won,
        games_lost: user.games_lost,
        games_draw: user.games_draw,
        win_rate: parseFloat(winRate),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Errore nel recupero statistiche',
    });
  }
});

module.exports = router;
