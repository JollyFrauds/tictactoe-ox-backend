/**
 * Crypto Payments Service - Integration with NOWPayments.io
 * 
 * NOWPayments è un processore di pagamenti crypto che supporta:
 * - BTC, ETH, USDT (TRC20/ERC20), USDC, LTC, DOGE, e 100+ altre crypto
 * - Commissioni basse (0.5%)
 * - Webhook automatici per conferme pagamento
 * - Conversione automatica in EUR/USD
 * 
 * Per usare: registrati su https://nowpayments.io
 */

const axios = require('axios');
const crypto = require('crypto');

const NOWPAYMENTS_API = 'https://api.nowpayments.io/v1';

class CryptoPaymentsService {
  constructor() {
    this.apiKey = process.env.NOWPAYMENTS_API_KEY;
    this.ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET;
  }

  // Verifica che il servizio sia configurato
  isConfigured() {
    return !!(this.apiKey && this.ipnSecret);
  }

  // Headers per le richieste API
  getHeaders() {
    return {
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Ottiene le crypto disponibili
   */
  async getAvailableCurrencies() {
    try {
      const response = await axios.get(`${NOWPAYMENTS_API}/currencies`, {
        headers: this.getHeaders(),
      });
      return response.data.currencies;
    } catch (error) {
      console.error('Error fetching currencies:', error.message);
      return ['btc', 'eth', 'usdttrc20', 'ltc'];
    }
  }

  /**
   * Ottiene il prezzo minimo per una crypto
   */
  async getMinimumPaymentAmount(currencyFrom, currencyTo = 'eur') {
    try {
      const response = await axios.get(
        `${NOWPAYMENTS_API}/min-amount?currency_from=${currencyFrom}&currency_to=${currencyTo}`,
        { headers: this.getHeaders() }
      );
      return response.data.min_amount;
    } catch (error) {
      console.error('Error fetching minimum amount:', error.message);
      return null;
    }
  }

  /**
   * Crea un nuovo pagamento/deposito
   * @param {number} amountEur - Importo in EUR
   * @param {string} payCurrency - Crypto da usare (btc, eth, usdttrc20, etc.)
   * @param {string} oderId - ID ordine univoco (es: odint_id + timestamp)
   * @param {string} ipnCallbackUrl - URL per webhook di conferma
   */
  async createPayment(amountEur, payCurrency, orderId, ipnCallbackUrl) {
    try {
      const response = await axios.post(
        `${NOWPAYMENTS_API}/payment`,
        {
          price_amount: amountEur,
          price_currency: 'eur',
          pay_currency: payCurrency.toLowerCase(),
          order_id: orderId,
          ipn_callback_url: ipnCallbackUrl,
          order_description: `TicTacToe OX Deposit - ${amountEur} EUR`,
        },
        { headers: this.getHeaders() }
      );

      return {
        success: true,
        payment_id: response.data.payment_id,
        pay_address: response.data.pay_address,
        pay_amount: response.data.pay_amount,
        pay_currency: response.data.pay_currency,
        price_amount: response.data.price_amount,
        price_currency: response.data.price_currency,
        valid_until: response.data.valid_until,
        status: response.data.payment_status,
      };
    } catch (error) {
      console.error('Error creating payment:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || 'Errore nella creazione del pagamento',
      };
    }
  }

  /**
   * Verifica lo stato di un pagamento
   */
  async getPaymentStatus(paymentId) {
    try {
      const response = await axios.get(
        `${NOWPAYMENTS_API}/payment/${paymentId}`,
        { headers: this.getHeaders() }
      );

      return {
        success: true,
        payment_id: response.data.payment_id,
        status: response.data.payment_status,
        pay_amount: response.data.pay_amount,
        actually_paid: response.data.actually_paid,
        outcome_amount: response.data.outcome_amount,
      };
    } catch (error) {
      console.error('Error checking payment:', error.message);
      return { success: false, error: 'Errore nel controllo pagamento' };
    }
  }

  /**
   * Crea un payout (prelievo)
   * Nota: richiede account NOWPayments verificato e fondi disponibili
   */
  async createPayout(address, amount, currency) {
    try {
      const response = await axios.post(
        `${NOWPAYMENTS_API}/payout`,
        {
          withdrawals: [{
            address: address,
            currency: currency.toLowerCase(),
            amount: amount,
          }],
        },
        { headers: this.getHeaders() }
      );

      return {
        success: true,
        payout_id: response.data.id,
        status: response.data.status,
      };
    } catch (error) {
      console.error('Error creating payout:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || 'Errore nel prelievo',
      };
    }
  }

  /**
   * Verifica la firma del webhook IPN
   * Importante per sicurezza - verifica che il webhook provenga da NOWPayments
   */
  verifyIPNSignature(payload, receivedSignature) {
    if (!this.ipnSecret) return false;

    // Ordina le chiavi alfabeticamente e crea la stringa
    const sortedPayload = this.sortObject(payload);
    const hmac = crypto.createHmac('sha512', this.ipnSecret);
    hmac.update(JSON.stringify(sortedPayload));
    const calculatedSignature = hmac.digest('hex');

    return calculatedSignature === receivedSignature;
  }

  // Helper per ordinare oggetto
  sortObject(obj) {
    return Object.keys(obj).sort().reduce((result, key) => {
      if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        result[key] = this.sortObject(obj[key]);
      } else {
        result[key] = obj[key];
      }
      return result;
    }, {});
  }

  /**
   * Stima il prezzo di conversione
   */
  async getEstimatedPrice(amountEur, currencyTo) {
    try {
      const response = await axios.get(
        `${NOWPAYMENTS_API}/estimate?amount=${amountEur}&currency_from=eur&currency_to=${currencyTo}`,
        { headers: this.getHeaders() }
      );
      return {
        success: true,
        estimated_amount: response.data.estimated_amount,
      };
    } catch (error) {
      return { success: false, error: 'Errore nella stima' };
    }
  }
}

module.exports = new CryptoPaymentsService();
