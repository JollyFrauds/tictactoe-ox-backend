const express = require('express');
const User = require('../models/User');
const { generateToken } = require('../middleware/auth');
const crypto = require('crypto');

const router = express.Router();

// Store reset codes temporarily (in production, use Redis or DB)
const resetCodes = new Map();

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

    // Auto-login after registration
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Registrazione completata! Hai ricevuto 100 FUN coins!',
      token,
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

// Forgot Password - Generate reset code
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email obbligatoria',
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal if email exists
      return res.json({
        success: true,
        message: 'Se l\'email esiste, riceverai un codice di reset',
      });
    }

    // Generate 6-digit code
    const resetCode = crypto.randomInt(100000, 999999).toString();
    
    // Store code with expiry (15 minutes)
    resetCodes.set(email, {
      code: resetCode,
      expires: Date.now() + 15 * 60 * 1000,
      userId: user._id,
    });

    // In production, send email here
    // For now, we'll log it and return it for testing
    console.log(`Password reset code for ${email}: ${resetCode}`);

    res.json({
      success: true,
      message: 'Codice di reset inviato! Controlla la tua email.',
      // ONLY FOR TESTING - Remove in production
      resetCode: resetCode,
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante la richiesta',
    });
  }
});

// Reset Password - Use code to set new password
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Tutti i campi sono obbligatori',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'La nuova password deve avere almeno 6 caratteri',
      });
    }

    const resetData = resetCodes.get(email);
    
    if (!resetData) {
      return res.status(400).json({
        success: false,
        message: 'Nessuna richiesta di reset trovata. Richiedi un nuovo codice.',
      });
    }

    if (Date.now() > resetData.expires) {
      resetCodes.delete(email);
      return res.status(400).json({
        success: false,
        message: 'Codice scaduto. Richiedi un nuovo codice.',
      });
    }

    if (resetData.code !== code) {
      return res.status(400).json({
        success: false,
        message: 'Codice non valido',
      });
    }

    // Update password
    const user = await User.findById(resetData.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utente non trovato',
      });
    }

    user.password = newPassword;
    await user.save();

    // Remove used code
    resetCodes.delete(email);

    res.json({
      success: true,
      message: 'Password aggiornata con successo! Ora puoi effettuare il login.',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante il reset della password',
    });
  }
});

module.exports = router;
