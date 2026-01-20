const express = require('express');
const User = require('../models/User');
const { generateToken } = require('../middleware/auth');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Tutti i campi sono obbligatori',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'La password deve avere almeno 6 caratteri',
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({
      $or: [{ email }, { odint_username: username }],
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email o username già in uso',
      });
    }

    // Create user
    const user = new User({
      odint_username: username,
      email,
      password,
      fun_balance: 100, // Welcome bonus
    });

    await user.save();

    res.status(201).json({
      success: true,
      message: 'Registrazione completata! Hai ricevuto 100 FUN coins!',
      user: user.toPublicJSON(),
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante la registrazione',
    });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email e password sono obbligatori',
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Credenziali non valide',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Credenziali non valide',
      });
    }

    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login effettuato',
      token,
      user: user.toPublicJSON(),
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante il login',
    });
  }
});

module.exports = router;
