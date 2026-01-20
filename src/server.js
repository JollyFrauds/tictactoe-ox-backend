require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const friendsRoutes = require('./routes/friends');
const walletRoutes = require('./routes/wallet');
const gamesRoutes = require('./routes/games');

// Import socket handler
const setupSocketHandlers = require('./socket/gameSocket');

const app = express();
const server = http.createServer(app);

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Security Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { success: false, message: 'Troppe richieste, riprova più tardi' }
});
app.use('/api/', limiter);

// Make io accessible in routes
app.set('io', io);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/games', gamesRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    name: 'TicTacToe OX Backend',
    version: '1.0.0',
    status: 'running'
  });
});

// Setup socket handlers
setupSocketHandlers(io);

// Connect to MongoDB (Railway uses MONGO_URL, render uses MONGODB_URI)
const MONGODB_URI = process.env.MONGO_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017/tictactoe_ox';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB');
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
  });

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🎮 Socket.IO ready for connections`);
  console.log(`💰 NOWPayments: ${process.env.NOWPAYMENTS_API_KEY ? 'Configured' : 'Not configured'}`);
});
