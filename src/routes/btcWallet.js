const express = require("express");
const router = express.Router();
const { walletService } = require("../services/walletService");
const User = require("../models/User");
const { authMiddleware } = require("../middleware/auth");

// Initialize wallet
if (process.env.WALLET_SEED) {
  walletService.initialize(process.env.WALLET_SEED);
}

router.get("/deposit-address", authMiddleware, async (req, res) => {
  try {
    const address = walletService.deriveDepositAddress(0);
    res.json({ success: true, deposit_address: address.address });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/hot-wallet-status", async (req, res) => {
  try {
    const addr = walletService.deriveDepositAddress(0).address;
    const balance = await walletService.getAddressBalance(addr);
    
    // Get BTC price from CoinGecko
    let btcPrice = null;
    try {
      const priceResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur', {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'TicTacToeOX/1.0'
      }
    });
      const priceData = await priceResponse.json();
      btcPrice = priceData.bitcoin?.eur || 75000;
    } catch (priceError) {
      console.error('Failed to fetch BTC price:', priceError.message);
    }
    
    res.json({ 
      success: true, 
      address: addr, 
      balanceSats: balance.balance,
      btcPrice: btcPrice
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/withdraw", authMiddleware, async (req, res) => {
  try {
    const { address, amountEur } = req.body;
    const user = await User.findById(req.user.id);
    if (!user.balanceReal || user.balanceReal < amountEur) {
      return res.status(400).json({ error: "Insufficient balance" });
    }
    const sats = Math.floor((amountEur / 95000) * 100000000);
    const result = await walletService.processWithdrawal(0, address, sats);
    user.balanceReal -= amountEur;
    await user.save();
    res.json({ success: true, txid: result.txid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



// Get user's transaction history
router.get("/transactions", authMiddleware, async (req, res) => {
  try {
    const transactions = await Transaction.find({ user_id: req.userId })
      .sort({ created_at: -1 })
      .limit(50);
    
    res.json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create deposit transaction (called when user requests deposit)
router.post("/create-deposit", authMiddleware, async (req, res) => {
  try {
    const { amount_eur } = req.body;
    const address = walletService.deriveDepositAddress(0);
    
    // Get current BTC price
    let btcPrice = 75000;
    try {
      const priceResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur', {
        headers: { 'Accept': 'application/json', 'User-Agent': 'TicTacToeOX/1.0' }
      });
      const priceData = await priceResponse.json();
      btcPrice = priceData.bitcoin?.eur || 75000;
    } catch (e) {}
    
    const amount_btc = amount_eur / btcPrice;
    
    const transaction = new Transaction({
      user_id: req.userId,
      type: 'deposit',
      amount_eur,
      amount_btc,
      wallet_address: address.address,
      status: 'awaiting'
    });
    
    await transaction.save();
    
    res.json({ 
      success: true, 
      deposit_address: address.address,
      amount_btc: amount_btc.toFixed(8),
      transaction_id: transaction._id
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update transaction status (for webhook or polling)
router.post("/update-transaction", async (req, res) => {
  try {
    const { tx_hash, status, confirmations } = req.body;
    
    const transaction = await Transaction.findOneAndUpdate(
      { tx_hash },
      { status, confirmations, updated_at: new Date() },
      { new: true }
    );
    
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    
    // If confirmed, update user balance
    if (status === 'confirmed' && transaction.type === 'deposit') {
      const User = require('../models/User');
      await User.findByIdAndUpdate(transaction.user_id, {
        $inc: { real_balance: transaction.amount_eur }
      });
    }
    
    res.json({ success: true, transaction });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
