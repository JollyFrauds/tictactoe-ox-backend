const express = require('express');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Search user by ODINT ID
router.get('/search/:odintId', authMiddleware, async (req, res) => {
  try {
    const { odintId } = req.params;
    
    if (odintId === req.user.odint_id) {
      return res.status(400).json({
        success: false,
        message: 'Non puoi cercare te stesso',
      });
    }

    const user = await User.findOne({ odint_id: odintId });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utente non trovato',
      });
    }

    res.json({
      success: true,
      user: {
        odint_id: user.odint_id,
        odint_username: user.odint_username,
        games_played: user.games_played,
        games_won: user.games_won,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Errore nella ricerca',
    });
  }
});

// Send friend request
router.post('/request', authMiddleware, async (req, res) => {
  try {
    const { target_odint_id } = req.body;
    const currentUser = req.user;

    if (target_odint_id === currentUser.odint_id) {
      return res.status(400).json({
        success: false,
        message: 'Non puoi inviare una richiesta a te stesso',
      });
    }

    const targetUser = await User.findOne({ odint_id: target_odint_id });
    
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'Utente non trovato',
      });
    }

    // Check if already friends
    if (currentUser.friends.includes(target_odint_id)) {
      return res.status(400).json({
        success: false,
        message: 'Siete già amici',
      });
    }

    // Check if request already sent
    if (targetUser.friend_requests.includes(currentUser.odint_id)) {
      return res.status(400).json({
        success: false,
        message: 'Richiesta già inviata',
      });
    }

    // Add request
    targetUser.friend_requests.push(currentUser.odint_id);
    await targetUser.save();

    res.json({
      success: true,
      message: 'Richiesta di amicizia inviata',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Errore nell\'invio della richiesta',
    });
  }
});

// Accept friend request
router.post('/accept', authMiddleware, async (req, res) => {
  try {
    const { requester_odint_id } = req.body;
    const currentUser = req.user;

    if (!currentUser.friend_requests.includes(requester_odint_id)) {
      return res.status(400).json({
        success: false,
        message: 'Richiesta non trovata',
      });
    }

    const requester = await User.findOne({ odint_id: requester_odint_id });
    
    if (!requester) {
      return res.status(404).json({
        success: false,
        message: 'Utente non trovato',
      });
    }

    // Add each other as friends
    currentUser.friends.push(requester_odint_id);
    currentUser.friend_requests = currentUser.friend_requests.filter(
      id => id !== requester_odint_id
    );
    
    requester.friends.push(currentUser.odint_id);

    await currentUser.save();
    await requester.save();

    res.json({
      success: true,
      message: 'Amicizia accettata',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Errore nell\'accettare la richiesta',
    });
  }
});

// Reject friend request
router.post('/reject', authMiddleware, async (req, res) => {
  try {
    const { requester_odint_id } = req.body;
    const currentUser = req.user;

    currentUser.friend_requests = currentUser.friend_requests.filter(
      id => id !== requester_odint_id
    );
    await currentUser.save();

    res.json({
      success: true,
      message: 'Richiesta rifiutata',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Errore nel rifiutare la richiesta',
    });
  }
});

// Get friends list
router.get('/list', authMiddleware, async (req, res) => {
  try {
    const friends = await User.find({
      odint_id: { $in: req.user.friends },
    });

    res.json({
      success: true,
      friends: friends.map(f => ({
        odint_id: f.odint_id,
        odint_username: f.odint_username,
        games_played: f.games_played,
        games_won: f.games_won,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Errore nel recupero amici',
    });
  }
});

// Get friend requests
router.get('/requests', authMiddleware, async (req, res) => {
  try {
    const requests = await User.find({
      odint_id: { $in: req.user.friend_requests },
    });

    res.json({
      success: true,
      requests: requests.map(r => ({
        odint_id: r.odint_id,
        odint_username: r.odint_username,
        games_played: r.games_played,
        games_won: r.games_won,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Errore nel recupero richieste',
    });
  }
});

module.exports = router;
