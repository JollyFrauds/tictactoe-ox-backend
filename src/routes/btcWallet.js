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
    res.json({ success: true, address: address.address });
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
      btcPrice = priceData.bitcoin?.eur || null;
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

module.exports = router;
