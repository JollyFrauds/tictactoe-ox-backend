const express = require('express');
const axios = require('axios');
const router = express.Router();
const { walletService } = require('../services/walletService');
const { authMiddleware } = require('../middleware/auth');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const DepositCounter = require('../models/DepositCounter');

// Get hot wallet info (admin/debug)
router.get('/hot-wallet-info', async (req, res) => {
  try {
    const info = walletService.getHotWalletInfo();
    const balance = await walletService.getWalletBalance();
    res.json({
      success: true,
      masterAddress: info.masterAddress,
      balance: balance,
      balanceBTC: (balance / 100000000).toFixed(8)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get UNIQUE deposit address for user
router.get('/deposit-address', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // If user already has a deposit address, return it
    if (user.deposit_address) {
      return res.json({
        success: true,
        address: user.deposit_address,
        message: 'Your unique BTC deposit address'
      });
    }
    
    // Generate new unique address for this user
    const index = await DepositCounter.getNextIndex();
    const depositResult = walletService.deriveDepositAddress(index);
    const address = depositResult.address;  // Extract address string from result object
    
    // Save to user
    user.deposit_index = index;
    user.deposit_address = address;
    await user.save();
    
    console.log(`Generated deposit address for user ${user.odint_username}: ${address} (index: ${index})`);
    
    // Get current BTC price and calculate amount
    const btcPrice = await getBtcPriceEur();
    const btcAmount = eurAmount / btcPrice;
    
    res.json({
      success: true,
      address: address,
      btc_amount: btcAmount.toFixed(8),
      btc_price: btcPrice,
      eur_amount: eurAmount,
      message: 'Your unique BTC deposit address'
    });
  } catch (error) {
    console.error('Error generating deposit address:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Request withdrawal
router.post('/withdraw', authMiddleware, async (req, res) => {
  try {
    const { amount, address } = req.body;
    
    if (!amount || !address) {
      return res.status(400).json({ success: false, error: 'Amount and address required' });
    }
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Check balance
    if (user.realBalance < amount) {
      return res.status(400).json({ success: false, error: 'Insufficient balance' });
    }
    
    // Convert EUR to BTC (approximate)
    const btcPrice = await walletService.getBtcPriceEur();
    const btcAmount = amount / btcPrice;
    const satoshis = Math.floor(btcAmount * 100000000);
    
    // Create pending transaction
    const transaction = new Transaction({
      odint_userId: user.odint_id,
      odint_username: user.odint_username,
      type: 'withdrawal',
      amount: amount,
      btcAmount: btcAmount,
      address: address,
      status: 'pending'
    });
    
    // Deduct balance immediately
    user.realBalance -= amount;
    await user.save();
    await transaction.save();
    
    // Try to send BTC
    try {
      const txid = await walletService.sendBitcoin(address, satoshis);
      transaction.txid = txid;
      transaction.status = 'confirmed';
      await transaction.save();
      
      res.json({
        success: true,
        txid: txid,
        message: 'Withdrawal processed successfully'
      });
    } catch (sendError) {
      // If sending fails, refund and update transaction
      user.realBalance += amount;
      await user.save();
      transaction.status = 'failed';
      transaction.error = sendError.message;
      await transaction.save();
      
      res.status(500).json({ success: false, error: sendError.message });
    }
  } catch (error) {
    console.error('Withdrawal error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check deposits (called by monitoring service)
router.post('/check-deposits', async (req, res) => {
  try {
    // Find all users with deposit addresses
    const usersWithAddresses = await User.find({ deposit_address: { $ne: null } });
    
    let credited = 0;
    const btcPrice = await walletService.getBtcPriceEur();
    
    for (const user of usersWithAddresses) {
      try {
        // Check balance on user's deposit address
        const balance = await walletService.checkAddressBalance(user.deposit_address);
        
        if (balance > 0) {
          // Check if we already processed this deposit
          const existingTx = await Transaction.findOne({
            odint_userId: user.odint_id,
            type: 'deposit',
            address: user.deposit_address,
            btcAmount: balance / 100000000
          });
          
          if (!existingTx) {
            // New deposit! Credit to user
            const eurAmount = (balance / 100000000) * btcPrice;
            
            // Create transaction record
            const transaction = new Transaction({
              odint_userId: user.odint_id,
              odint_username: user.odint_username,
              type: 'deposit',
              amount: eurAmount,
              btcAmount: balance / 100000000,
              address: user.deposit_address,
              status: 'confirmed'
            });
            await transaction.save();
            
            // Credit user balance
            user.realBalance += eurAmount;
            await user.save();
            
            console.log(`Credited ${eurAmount}€ to user ${user.odint_username} from deposit of ${balance} satoshis`);
            credited++;
          }
        }
      } catch (userError) {
        console.error(`Error checking deposits for user ${user.odint_username}:`, userError.message);
      }
    }
    
    res.json({
      success: true,
      usersChecked: usersWithAddresses.length,
      depositsCredicted: credited
    });
  } catch (error) {
    console.error('Check deposits error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Transaction history for user
router.get('/transactions', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    const transactions = await Transaction.find({ odint_userId: user.odint_id })
      .sort({ createdAt: -1 })
      .limit(50);
    
    res.json({
      success: true,
      transactions: transactions
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
