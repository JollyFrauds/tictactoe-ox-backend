const express = require('express');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');
const cryptoPayments = require('../services/cryptoPayments');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// In-memory pending deposits (in produzione usa Redis o MongoDB)
const pendingDeposits = new Map();

// ==================== DAILY CHECK-IN ====================

router.post('/check-in', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    const now = new Date();
    const DAILY_BONUS = parseInt(process.env.DAILY_FUN_BONUS) || 50;
    
    // Check if 24 hours have passed
    if (user.last_check_in) {
      const lastCheckIn = new Date(user.last_check_in);
      const hoursSinceLastCheckIn = (now - lastCheckIn) / (1000 * 60 * 60);
      
      if (hoursSinceLastCheckIn < 24) {
        const hoursRemaining = Math.ceil(24 - hoursSinceLastCheckIn);
        return res.status(400).json({
          success: false,
          message: `Prossimo check-in disponibile tra ${hoursRemaining} ore`,
          next_check_in: new Date(lastCheckIn.getTime() + 24 * 60 * 60 * 1000),
        });
      }
    }
    
    // Award daily bonus
    user.fun_balance += DAILY_BONUS;
    user.last_check_in = now;
    await user.save();
    
    res.json({
      success: true,
      message: `Hai ricevuto ${DAILY_BONUS} monete FUN!`,
      fun_balance: user.fun_balance,
      bonus_amount: DAILY_BONUS,
    });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nel check-in',
    });
  }
});

// ==================== BALANCES ====================

router.get('/balance', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    
    // Check if check-in is available
    let checkInAvailable = true;
    if (user.last_check_in) {
      const hoursSinceLastCheckIn = (new Date() - new Date(user.last_check_in)) / (1000 * 60 * 60);
      checkInAvailable = hoursSinceLastCheckIn >= 24;
    }
    
    res.json({
      success: true,
      fun_balance: user.fun_balance,
      real_balance: user.real_balance,
      check_in_available: checkInAvailable,
      last_check_in: user.last_check_in,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Errore nel recupero del saldo',
    });
  }
});

// ==================== CRYPTO DEPOSITS ====================

// Get supported cryptocurrencies
router.get('/crypto/currencies', authMiddleware, async (req, res) => {
  try {
    // Lista principale di crypto supportate
    const currencies = [
      { code: 'BTC', name: 'Bitcoin', network: 'Bitcoin' },
      { code: 'ETH', name: 'Ethereum', network: 'ERC20' },
      { code: 'USDTTRC20', name: 'USDT', network: 'TRC20 (Tron)' },
      { code: 'USDTERC20', name: 'USDT', network: 'ERC20' },
      { code: 'USDC', name: 'USD Coin', network: 'ERC20' },
      { code: 'LTC', name: 'Litecoin', network: 'Litecoin' },
    ];
    
    res.json({
      success: true,
      currencies,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Errore nel recupero delle criptovalute',
    });
  }
});

// Create deposit request
router.post('/deposit', authMiddleware, async (req, res) => {
  try {
    const { amount, currency } = req.body;
    const user = req.user;
    
    if (!amount || !currency) {
      return res.status(400).json({
        success: false,
        message: 'Importo e criptovaluta sono obbligatori',
      });
    }
    
    const validAmounts = [5, 10, 15, 20, 25, 50, 100, 200, 500];
    if (!validAmounts.includes(amount)) {
      return res.status(400).json({
        success: false,
        message: 'Importo non valido',
        valid_amounts: validAmounts,
      });
    }
    
    // Check if NOWPayments is configured
    if (!cryptoPayments.isConfigured()) {
      // Fallback: generate simulated address for development
      const orderId = `${user.odint_id}_${Date.now()}`;
      const simulatedAddress = generateSimulatedAddress(currency);
      
      pendingDeposits.set(orderId, {
        user_id: user.odint_id,
        amount: amount,
        currency: currency,
        address: simulatedAddress,
        status: 'waiting',
        created_at: new Date(),
      });
      
      return res.json({
        success: true,
        mode: 'development',
        order_id: orderId,
        deposit_address: simulatedAddress,
        amount_eur: amount,
        currency: currency,
        note: '⚠️ Modalità sviluppo - Configura NOWPayments per pagamenti reali',
        expires_in: '30 minuti',
      });
    }
    
    // Production: use NOWPayments
    const orderId = `${user.odint_id}_${Date.now()}`;
    const callbackUrl = `${process.env.BASE_URL || 'https://tictactoe-ox-backend-production.up.railway.app'}/api/wallet/webhook/nowpayments`;
    
    const payment = await cryptoPayments.createPayment(
      amount,
      currency,
      orderId,
      callbackUrl
    );
    
    if (!payment.success) {
      return res.status(400).json({
        success: false,
        message: payment.error || 'Errore nella creazione del deposito',
      });
    }
    
    // Store pending deposit
    pendingDeposits.set(payment.payment_id, {
      user_id: user.odint_id,
      order_id: orderId,
      amount_eur: amount,
      ...payment,
    });
    
    res.json({
      success: true,
      payment_id: payment.payment_id,
      deposit_address: payment.pay_address,
      amount_crypto: payment.pay_amount,
      currency: payment.pay_currency.toUpperCase(),
      amount_eur: amount,
      valid_until: payment.valid_until,
      note: `Invia esattamente ${payment.pay_amount} ${payment.pay_currency.toUpperCase()} a questo indirizzo`,
    });
    
  } catch (error) {
    console.error('Deposit error:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nella creazione del deposito',
    });
  }
});

// Check deposit status
router.get('/deposit/:paymentId/status', authMiddleware, async (req, res) => {
  try {
    const { paymentId } = req.params;
    const deposit = pendingDeposits.get(paymentId);
    
    if (!deposit || deposit.user_id !== req.user.odint_id) {
      return res.status(404).json({
        success: false,
        message: 'Deposito non trovato',
      });
    }
    
    // If NOWPayments is configured, check real status
    if (cryptoPayments.isConfigured()) {
      const status = await cryptoPayments.getPaymentStatus(paymentId);
      return res.json({
        success: true,
        ...status,
      });
    }
    
    res.json({
      success: true,
      payment_id: paymentId,
      status: deposit.status,
      amount_eur: deposit.amount,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Errore nel controllo stato',
    });
  }
});

// NOWPayments IPN Webhook
router.post('/webhook/nowpayments', async (req, res) => {
  try {
    const signature = req.headers['x-nowpayments-sig'];
    const payload = req.body;
    
    // Verify signature
    if (cryptoPayments.isConfigured()) {
      const isValid = cryptoPayments.verifyIPNSignature(payload, signature);
      if (!isValid) {
        console.error('Invalid IPN signature');
        return res.status(403).json({ error: 'Invalid signature' });
      }
    }
    
    const { payment_id, payment_status, order_id, actually_paid, price_amount } = payload;
    
    console.log(`💰 Payment webhook: ${payment_id} - Status: ${payment_status}`);
    
    // Process based on status
    if (payment_status === 'finished' || payment_status === 'confirmed') {
      // Find user from order_id (format: odint_id_timestamp)
      const userId = order_id.split('_')[0];
      const user = await User.findOne({ odint_id: userId });
      
      if (user) {
        // Credit the user's balance
        user.real_balance += parseFloat(price_amount);
        await user.save();
        
        console.log(`✅ Credited ${price_amount} EUR to user ${userId}`);
        
        // Update pending deposit
        if (pendingDeposits.has(payment_id)) {
          pendingDeposits.get(payment_id).status = 'completed';
        }
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ==================== WITHDRAWALS ====================

router.post('/withdraw', authMiddleware, async (req, res) => {
  try {
    const { amount, currency, wallet_address } = req.body;
    const user = req.user;
    const MIN_WITHDRAWAL = 10;
    const WITHDRAWAL_FEE_PERCENT = 2;

    if (!amount || !currency || !wallet_address) {
      return res.status(400).json({
        success: false,
        message: 'Tutti i campi sono obbligatori',
      });
    }

    if (amount < MIN_WITHDRAWAL) {
      return res.status(400).json({
        success: false,
        message: `Importo minimo: €${MIN_WITHDRAWAL}`,
      });
    }

    if (user.real_balance < amount) {
      return res.status(400).json({
        success: false,
        message: 'Saldo insufficiente',
        balance: user.real_balance,
      });
    }

    // Calculate fee
    const fee = amount * (WITHDRAWAL_FEE_PERCENT / 100);
    const netAmount = amount - fee;

    // Deduct balance immediately
    user.real_balance -= amount;
    await user.save();

    // In production with NOWPayments configured
    if (cryptoPayments.isConfigured()) {
      // Note: NOWPayments payout requires verified merchant account
      // For now, queue for manual processing
    }

    // Create withdrawal record (in production, save to DB)
    const withdrawal = {
      id: uuidv4(),
      user_id: user.odint_id,
      amount: amount,
      fee: fee,
      net_amount: netAmount,
      currency: currency,
      wallet_address: wallet_address,
      status: 'pending',
      created_at: new Date(),
    };

    res.json({
      success: true,
      message: 'Richiesta di prelievo inviata. Sarà elaborata entro 24-48h.',
      withdrawal: {
        id: withdrawal.id,
        amount: amount,
        fee: fee,
        net_amount: netAmount,
        currency: currency,
        status: 'pending',
      },
    });
  } catch (error) {
    console.error('Withdrawal error:', error);
    res.status(500).json({
      success: false,
      message: 'Errore nella richiesta di prelievo',
    });
  }
});

// ==================== HELPERS ====================

function generateSimulatedAddress(currency) {
  const prefixes = {
    BTC: '1',
    ETH: '0x',
    USDTTRC20: 'T',
    USDTERC20: '0x',
    USDC: '0x',
    LTC: 'L',
  };
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz123456789';
  const prefix = prefixes[currency.toUpperCase()] || '0x';
  let address = prefix;
  const length = currency.toUpperCase().startsWith('BTC') ? 33 : 40;
  
  for (let i = prefix.length; i < length; i++) {
    address += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return address;
}

// Admin endpoint to manually confirm deposit (for testing)
router.post('/admin/confirm-deposit', async (req, res) => {
  const { admin_secret, user_id, amount } = req.body;
  
  if (admin_secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  
  try {
    const user = await User.findOne({ odint_id: user_id });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.real_balance += amount;
    await user.save();
    
    res.json({
      success: true,
      message: `Credited ${amount} EUR to user ${user_id}`,
      new_balance: user.real_balance,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to credit balance' });
  }
});

// Admin credit endpoint
router.post("/admin/credit", authMiddleware, async (req, res) => { try { const { amount, balance_type } = req.body; const user = await User.findById(req.user.userId); if (!user) return res.status(404).json({ error: "User not found" }); if (balance_type === "real") { user.real_balance = (user.real_balance || 0) + parseFloat(amount); } else { user.fun_balance = (user.fun_balance || 0) + parseFloat(amount); } await user.save(); res.json({ success: true, real_balance: user.real_balance, fun_balance: user.fun_balance }); } catch (error) { res.status(500).json({ error: error.message }); } });



// TEMP: Restore balance endpoint
router.post("/restore-balance", async (req, res) => {
  try {
    const { odint_id, amount } = req.body;
    const User = require('../models/User');
    const user = await User.findOne({ odint_id });
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.real_balance += parseFloat(amount);
    await user.save();
    res.json({ success: true, real_balance: user.real_balance, fun_balance: user.fun_balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
