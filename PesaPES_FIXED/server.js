
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Simple in-memory database (resets on restart - upgrade later)
const users = {};
const challenges = {};
const messages = [];

console.log('Starting PesaPES server...');

// HEALTH CHECK
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'PesaPES is running!',
    users: Object.keys(users).length,
    challenges: Object.keys(challenges).length
  });
});

// REGISTER
app.post('/api/register', (req, res) => {
  const { name, phone, password } = req.body;
  
  if (!name || !phone || !password) {
    return res.status(400).json({ error: 'All fields required' });
  }
  
  if (users[phone]) {
    return res.status(400).json({ error: 'Phone already registered' });
  }
  
  users[phone] = {
    id: 'user_' + Date.now(),
    name,
    phone,
    password, // NOTE: In production, hash this!
    avatar: name[0].toUpperCase(),
    createdAt: new Date().toISOString(),
    balance: 0
  };
  
  console.log('New user registered:', name, phone);
  
  res.json({
    success: true,
    token: 'token_' + phone, // Simple token
    user: {
      id: users[phone].id,
      name,
      phone,
      avatar: name[0].toUpperCase()
    }
  });
});

// LOGIN
app.post('/api/login', (req, res) => {
  const { phone, password } = req.body;
  
  const user = users[phone];
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid phone or password' });
  }
  
  console.log('User logged in:', user.name);
  
  res.json({
    success: true,
    token: 'token_' + phone,
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      avatar: user.avatar
    }
  });
});

// GET USER
app.get('/api/me', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  
  const phone = token.replace('token_', '');
  const user = users[phone];
  
  if (!user) return res.status(404).json({ error: 'User not found' });
  
  res.json({
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      avatar: user.avatar
    },
    wallet: { balance: user.balance || 0 }
  });
});

// DEPOSIT
app.post('/api/deposit', (req, res) => {
  const { phone, amount } = req.body;
  if (users[phone]) {
    users[phone].balance = (users[phone].balance || 0) + parseInt(amount);
    res.json({ success: true, newBalance: users[phone].balance });
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

// SOCKET.IO
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  socket.on('join', (data) => {
    socket.username = data.name;
    socket.phone = data.phone;
    socket.join('main');
    
    socket.emit('init', {
      messages: messages.slice(-50),
      challenges: Object.values(challenges),
      online: Object.keys(users).length
    });
    
    socket.broadcast.emit('user_joined', { name: data.name });
  });
  
  socket.on('send_message', (data) => {
    const msg = {
      id: Date.now(),
      username: socket.username,
      text: data.text,
      timestamp: new Date().toISOString()
    };
    messages.push(msg);
    io.to('main').emit('new_message', msg);
  });
  
  socket.on('create_challenge', (data) => {
    const challenge = {
      id: 'ch_' + Date.now(),
      creator: socket.username,
      stake: data.stake,
      status: 'open',
      createdAt: new Date().toISOString()
    };
    challenges[challenge.id] = challenge;
    io.to('main').emit('new_challenge', challenge);
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('=================================');
  console.log('🚀 PesaPES Server Running!');
  console.log('📍 Port:', PORT);
  console.log('📱 M-Pesa:', '0741757296');
  console.log('🌐 Health: /health');
  console.log('=================================');
});
