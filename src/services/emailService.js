// src/services/emailService.js
const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.adminEmail = process.env.ADMIN_EMAIL || 'mangogabriele23@gmail.com';
    this.transporter = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    // Use Gmail SMTP or generic SMTP
    if (process.env.SMTP_HOST) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    } else if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
      // Gmail with App Password
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD
        }
      });
    } else {
      console.log('Email service not configured - notifications will be logged only');
      return;
    }
    
    this.initialized = true;
    console.log('Email service initialized');
  }

  async sendWithdrawalNotification(withdrawal) {
    const subject = `🔔 Nuova Richiesta Prelievo - €${withdrawal.amount}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #9333ea;">💰 Nuova Richiesta di Prelievo</h2>
        
        <div style="background: #f3e8ff; padding: 20px; border-radius: 10px; margin: 20px 0;">
          <table style="width: 100%;">
            <tr>
              <td><strong>ID Richiesta:</strong></td>
              <td>${withdrawal.id}</td>
            </tr>
            <tr>
              <td><strong>Utente ID:</strong></td>
              <td>${withdrawal.user_id}</td>
            </tr>
            <tr>
              <td><strong>Username:</strong></td>
              <td>${withdrawal.username || 'N/A'}</td>
            </tr>
            <tr>
              <td><strong>Importo Richiesto:</strong></td>
              <td style="color: #dc2626; font-size: 18px;"><strong>€${withdrawal.amount}</strong></td>
            </tr>
            <tr>
              <td><strong>Fee (5%):</strong></td>
              <td>€${withdrawal.fee}</td>
            </tr>
            <tr>
              <td><strong>Importo Netto:</strong></td>
              <td style="color: #16a34a; font-size: 18px;"><strong>€${withdrawal.net_amount}</strong></td>
            </tr>
            <tr>
              <td><strong>Crypto:</strong></td>
              <td>${withdrawal.currency.toUpperCase()}</td>
            </tr>
            <tr>
              <td><strong>Indirizzo Wallet:</strong></td>
              <td style="font-family: monospace; word-break: break-all;">${withdrawal.wallet_address}</td>
            </tr>
            <tr>
              <td><strong>Data Richiesta:</strong></td>
              <td>${new Date(withdrawal.created_at).toLocaleString('it-IT')}</td>
            </tr>
          </table>
        </div>

        <div style="background: #fef3c7; padding: 15px; border-radius: 10px; margin: 20px 0;">
          <h3 style="color: #92400e; margin-top: 0;">⚠️ Azione Richiesta</h3>
          <p>Vai alla dashboard NOWPayments per processare questo prelievo:</p>
          <ol>
            <li>Accedi a <a href="https://account.nowpayments.io">NOWPayments Dashboard</a></li>
            <li>Vai su <strong>Mass Payouts</strong></li>
            <li>Clicca <strong>Create manually</strong></li>
            <li>Inserisci: <strong>${withdrawal.currency.toUpperCase()}</strong>, <strong>€${withdrawal.net_amount}</strong></li>
            <li>Indirizzo: <code>${withdrawal.wallet_address}</code></li>
            <li>Completa la verifica 2FA</li>
          </ol>
        </div>

        <p style="color: #6b7280; font-size: 12px;">
          TicTacToe OX - Sistema Notifiche Automatiche
        </p>
      </div>
    `;

    await this.sendEmail(subject, html);
  }

  async sendEmail(subject, html) {
    // Always log
    console.log('='.repeat(60));
    console.log('📧 EMAIL NOTIFICATION');
    console.log('To:', this.adminEmail);
    console.log('Subject:', subject);
    console.log('='.repeat(60));

    if (!this.transporter) {
      console.log('Email transporter not configured - notification logged only');
      return { success: false, reason: 'not_configured' };
    }

    try {
      const info = await this.transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.GMAIL_USER || 'noreply@tictactoe-ox.com',
        to: this.adminEmail,
        subject: subject,
        html: html
      });
      
      console.log('Email sent:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Failed to send email:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new EmailService();
