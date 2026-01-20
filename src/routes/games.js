const express = require('express');
const Game = require('../models/Game');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Get game history
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.odint_id;
    
    const games = await Game.find({
      $or: [
        { player1_id: userId },
        { player2_id: userId },
      ],
      status: 'finished',
    })
    .sort({ finished_at: -1 })
    .limit(50);

    res.json({
      success: true,
      games: games.map(g => g.toJSON()),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Errore nel recupero partite',
    });
  }
});

// Get game by ID
router.get('/:gameId', authMiddleware, async (req, res) => {
  try {
    const game = await Game.findOne({ game_id: req.params.gameId });
    
    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Partita non trovata',
      });
    }

    res.json({
      success: true,
      game: game.toJSON(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Errore nel recupero partita',
    });
  }
});

module.exports = router;
