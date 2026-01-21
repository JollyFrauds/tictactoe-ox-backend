const bitcoin = require('bitcoinjs-lib');
const bip39 = require('bip39');
const { BIP32Factory } = require('bip32');
const ecc = require('@bitcoinerlab/secp256k1');
const axios = require('axios');

const bip32 = BIP32Factory(ecc);

// Network configuration (mainnet for real BTC)
const network = bitcoin.networks.bitcoin;

// Blockcypher API for broadcasting and monitoring
const BLOCKCYPHER_API = 'https://api.blockcypher.com/v1/btc/main';

class WalletService {
  constructor() {
    this.masterKey = null;
    this.depositIndex = 0;
  }

  // Initialize wallet from seed phrase (stored in env)
  initialize(seedPhrase) {
    if (!seedPhrase) {
      throw new Error('WALLET_SEED environment variable not set');
    }
    const seed = bip39.mnemonicToSeedSync(seedPhrase);
    this.masterKey = bip32.fromSeed(seed, network);
    console.log('Wallet initialized successfully');
  }

  // Generate new seed phrase (run once, save to env)
  static generateNewSeed() {
    return bip39.generateMnemonic(256); // 24 words
  }

  // Derive deposit address for user (BIP84 - native segwit)
  deriveDepositAddress(index) {
    // m/84'/0'/0'/0/index - receiving addresses
    const path = `m/84'/0'/0'/0/${index}`;
    const child = this.masterKey.derivePath(path);
    const { address } = bitcoin.payments.p2wpkh({
      pubkey: child.publicKey,
      network: network
    });
    return { address, index, path };
  }

  // Get private key for signing (internal use only)
  getPrivateKey(index) {
    const path = `m/84'/0'/0'/0/${index}`;
    return this.masterKey.derivePath(path);
  }

  // Check address balance using Blockcypher
  async getAddressBalance(address) {
    try {
      const response = await axios.get(`${BLOCKCYPHER_API}/addrs/${address}/balance`);
      return {
        balance: response.data.balance, // confirmed satoshis
        unconfirmedBalance: response.data.unconfirmed_balance,
        totalReceived: response.data.total_received
      };
    } catch (error) {
      console.error('Error getting balance:', error.message);
      throw error;
    }
  }

  // Get UTXOs for an address
  async getUTXOs(address) {
    try {
      const response = await axios.get(`${BLOCKCYPHER_API}/addrs/${address}?unspentOnly=true&includeScript=true`);
      return response.data.txrefs || [];
    } catch (error) {
      console.error('Error getting UTXOs:', error.message);
      return [];
    }
  }

  // Get current fee rate (satoshis per byte)
  async getFeeRate() {
    try {
      const response = await axios.get('https://mempool.space/api/v1/fees/recommended');
      return response.data.halfHourFee; // medium priority
    } catch (error) {
      console.error('Error getting fee rate:', error.message);
      return 10; // fallback to 10 sat/vbyte
    }
  }

  // Create and sign a transaction for withdrawal
  async createWithdrawal(fromIndex, toAddress, amountSatoshis) {
    const keyPair = this.getPrivateKey(fromIndex);
    const fromAddress = this.deriveDepositAddress(fromIndex).address;
    
    // Get UTXOs
    const utxos = await this.getUTXOs(fromAddress);
    if (utxos.length === 0) {
      throw new Error('No UTXOs available for withdrawal');
    }

    // Get fee rate
    const feeRate = await this.getFeeRate();
    
    // Estimate transaction size (1 input, 2 outputs) ~140 vbytes
    const estimatedFee = feeRate * 140;
    
    // Calculate total available
    const totalAvailable = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
    
    if (totalAvailable < amountSatoshis + estimatedFee) {
      throw new Error(`Insufficient balance. Available: ${totalAvailable}, Needed: ${amountSatoshis + estimatedFee}`);
    }

    // Build transaction using Psbt
    const psbt = new bitcoin.Psbt({ network });
    
    // Add inputs
    let inputTotal = 0;
    for (const utxo of utxos) {
      // Get raw transaction for non-witness UTXO
      const txResponse = await axios.get(`${BLOCKCYPHER_API}/txs/${utxo.tx_hash}?includeHex=true`);
      
      psbt.addInput({
        hash: utxo.tx_hash,
        index: utxo.tx_output_n,
        witnessUtxo: {
          script: bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network }).output,
          value: utxo.value
        }
      });
      
      inputTotal += utxo.value;
      if (inputTotal >= amountSatoshis + estimatedFee) break;
    }

    // Add output to recipient
    psbt.addOutput({
      address: toAddress,
      value: amountSatoshis
    });

    // Add change output if needed
    const change = inputTotal - amountSatoshis - estimatedFee;
    if (change > 546) { // dust threshold
      psbt.addOutput({
        address: fromAddress,
        value: change
      });
    }

    // Sign all inputs
    psbt.signAllInputs(keyPair);
    psbt.finalizeAllInputs();

    // Get raw transaction hex
    const txHex = psbt.extractTransaction().toHex();
    
    return { txHex, fee: estimatedFee };
  }

  // Broadcast transaction to network
  async broadcastTransaction(txHex) {
    try {
      const response = await axios.post(`${BLOCKCYPHER_API}/txs/push`, {
        tx: txHex
      });
      return {
        success: true,
        txid: response.data.tx.hash,
        message: 'Transaction broadcast successfully'
      };
    } catch (error) {
      console.error('Broadcast error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.error || 'Failed to broadcast transaction');
    }
  }

  // Full withdrawal process
  async processWithdrawal(fromIndex, toAddress, amountSatoshis) {
    console.log(`Processing withdrawal: ${amountSatoshis} satoshis to ${toAddress}`);
    
    // Create and sign transaction
    const { txHex, fee } = await this.createWithdrawal(fromIndex, toAddress, amountSatoshis);
    console.log(`Transaction created. Fee: ${fee} satoshis`);
    
    // Broadcast
    const result = await this.broadcastTransaction(txHex);
    console.log(`Transaction broadcast: ${result.txid}`);
    
    return result;
  }
}

// Singleton instance
const walletService = new WalletService();


// Check balance of a specific address
async function checkAddressBalance(address) {
  try {
    const response = await axios.get(`https://api.blockcypher.com/v1/btc/main/addrs/${address}/balance`);
    return response.data.balance || 0;
  } catch (error) {
    console.error('Error checking address balance:', error.message);
    return 0;
  }
}

module.exports = {
  checkAddressBalance, WalletService, walletService };
