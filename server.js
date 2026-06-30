// ChatApp - A simple WhatsApp-style 1-on-1 chat website
// Real-time messaging using Socket.io, simple name/phone login (no password).

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Simple JSON file database ----------
// Stores: list of users who have ever logged in, and all messages.
const dbDir = path.join(__dirname, 'db');
const dbPath = path.join(dbDir, 'chat.json');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify({ users: [], messages: [], nextId: 1 }, null, 2));
}

function readDb() {
  return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
}
function writeDb(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

// ---------- File/photo uploads ----------
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

// Photos + common document/file types, max 25MB
const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.doc', '.docx', '.txt', '.ppt', '.pptx', '.xls', '.xlsx', '.zip', '.mp4', '.mov'];
const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('That file type is not allowed.'));
    }
  }
});

app.use('/uploads', express.static(uploadsDir));

// Upload a file/photo to send in a chat
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file was uploaded.' });
  const ext = path.extname(req.file.originalname).toLowerCase();
  res.json({
    success: true,
    url: `/uploads/${req.file.filename}`,
    originalName: req.file.originalname,
    isImage: imageExtensions.includes(ext),
    size: req.file.size
  });
});

app.use((err, req, res, next) => {
  if (err) return res.status(400).json({ error: err.message });
  next();
});

// Build a consistent "conversation id" for any pair of users, regardless of order
function conversationId(userA, userB) {
  return [userA, userB].sort().join('::');
}

// ---------- Track who is currently online ----------
// Maps username -> socket.id
const onlineUsers = new Map();

// ---------- REST endpoints ----------

// "Log in" - just registers/remembers the name, no password
app.post('/api/login', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Please enter a name or phone number.' });

  const data = readDb();
  if (!data.users.find(u => u.toLowerCase() === name.toLowerCase())) {
    data.users.push(name);
    writeDb(data);
  }
  res.json({ success: true, name });
});

// Get list of all known users (so you can pick someone to chat with)
app.get('/api/users', (req, res) => {
  const data = readDb();
  res.json(data.users);
});

// Get message history between the current user and another user
app.get('/api/messages/:me/:other', (req, res) => {
  const { me, other } = req.params;
  const data = readDb();
  const convoId = conversationId(me, other);
  const messages = data.messages.filter(m => m.conversationId === convoId);
  res.json(messages);
});

// ---------- Real-time messaging ----------
io.on('connection', (socket) => {
  let currentUser = null;

  socket.on('identify', (name) => {
    currentUser = name;
    onlineUsers.set(name, socket.id);
    io.emit('presence', Array.from(onlineUsers.keys()));
  });

  socket.on('send_message', ({ from, to, text, attachment }) => {
    if (!from || !to) return;
    if ((!text || !text.trim()) && !attachment) return;

    const data = readDb();
    const message = {
      id: data.nextId++,
      conversationId: conversationId(from, to),
      from,
      to,
      text: text ? text.trim() : '',
      attachment: attachment || null, // { url, originalName, isImage, size }
      timestamp: new Date().toISOString()
    };
    data.messages.push(message);
    writeDb(data);

    // Send to recipient if they're online
    const recipientSocketId = onlineUsers.get(to);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('new_message', message);
    }
    // Also echo back to sender (so their own screen updates instantly)
    socket.emit('new_message', message);
  });

  // ---------- Voice/video call signaling ----------
  // These events just pass WebRTC connection info between the two browsers;
  // the actual audio/video travels directly between the two people once connected.
  socket.on('call_user', ({ from, to, callType }) => {
    const recipientSocketId = onlineUsers.get(to);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('incoming_call', { from, callType });
    } else {
      socket.emit('call_failed', { to, reason: 'not_online' });
    }
  });

  socket.on('call_accepted', ({ from, to }) => {
    const callerSocketId = onlineUsers.get(to);
    if (callerSocketId) io.to(callerSocketId).emit('call_accepted', { from });
  });

  socket.on('call_rejected', ({ from, to }) => {
    const callerSocketId = onlineUsers.get(to);
    if (callerSocketId) io.to(callerSocketId).emit('call_rejected', { from });
  });

  socket.on('call_ended', ({ from, to }) => {
    const otherSocketId = onlineUsers.get(to);
    if (otherSocketId) io.to(otherSocketId).emit('call_ended', { from });
  });

  // WebRTC connection setup messages (offer/answer/ice candidates) - just relayed as-is
  socket.on('webrtc_signal', ({ from, to, signal }) => {
    const recipientSocketId = onlineUsers.get(to);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('webrtc_signal', { from, signal });
    }
  });

  socket.on('typing', ({ from, to }) => {
    const recipientSocketId = onlineUsers.get(to);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('typing', { from });
    }
  });

  socket.on('disconnect', () => {
    if (currentUser) {
      onlineUsers.delete(currentUser);
      io.emit('presence', Array.from(onlineUsers.keys()));
    }
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`ChatApp is running on http://localhost:${PORT}`);
});
