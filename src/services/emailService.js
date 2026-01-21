const https = require('https');
const BREVO_KEY = 'xkeysib-61466333e778a625373d39bcceab813e4aa2d2cbc9';
const ADMIN = 'mangogabriele23@gmail.com';

class EmailService {
  constructor() { console.log("Email service ready (Brevo API)"); }

  sendEmail(to, subj, html) {
    const data = JSON.stringify({sender:{email:ADMIN,name:"TicTacToe OX"},to:[{email:to}],subject:subj,htmlContent:html});
    const opts = {hostname:"api.brevo.com",port:443,path:"/v3/smtp/email",method:"POST",headers:{"Content-Type":"application/json","api-key":BREVO_KEY,"Content-Length":Buffer.byteLength(data)}};
    const req = https.request(opts, r => { let b=""; r.on("data",c=>b+=c); r.on("end",()=>console.log("Email sent:",r.statusCode)); });
    req.on("error", e => console.error("Email error:",e.message));
    req.write(data); req.end();
  }

  sendWithdrawalNotification(d) {
    console.log("Sending withdrawal notification email...");
    const html = "<h2>Nuova Richiesta Prelievo</h2><p>User: "+d.username+"</p><p>Amount: EUR "+d.amount+"</p><p>Fee: EUR "+d.fee+"</p><p>Net: EUR "+d.net_amount+"</p><p>Wallet: "+d.wallet_address+"</p><p>ID: "+d.withdrawal_id+"</p>";
    this.sendEmail(ADMIN, "Prelievo EUR "+d.amount, html);
    return { success: true };
  }

  initialize() { return this; }
}

module.exports = new EmailService();
