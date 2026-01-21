const express = require('express');
const router = express.Router();

const CURRENT_VERSION = '1.6.0';
const APK_URL = 'https://github.com/JollyFrauds/tictactoe-ox-backend/releases/download/v1.6.0/TicTacToe_OX_v16.apk';

router.get('/check', (req, res) => {
  res.json({
    success: true,
    version: CURRENT_VERSION,
    apkUrl: APK_URL,
    releaseNotes: 'Nuova versione',
    mandatory: false
  });
});

module.exports = router;
