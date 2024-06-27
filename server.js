const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const { check, validationResult } = require('express-validator');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/messaging-app', { useNewUrlParser: true, useUnifiedTopology: true });

// Define the Message schema and model
const messageSchema = new mongoose.Schema({
  content: String,
  author: String,
  timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);

// Basic route
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// POST /messages: Create a new message with validation
app.post('/messages', [
  check('content').notEmpty().withMessage('Content is required'),
  check('author').notEmpty().withMessage('Author is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const message = new Message(req.body);
    await message.save();
    io.emit('message', req.body); // Emit the message to all connected clients
    res.status(201).send(message);
  } catch (error) {
    res.status(400).send(error);
  }
});

// GET /messages: Retrieve recent messages
app.get('/messages', async (req, res) => {
  try {
    const messages = await Message.find().sort({ timestamp: -1 }).limit(10);
    res.status(200).send(messages);
  } catch (error) {
    res.status(500).send(error);
  }
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log('A user connected');

  // Send the last 10 messages to the newly connected user
  Message.find().sort({ timestamp: -1 }).limit(10).exec((err, messages) => {
    if (err) {
      console.error(err);
      return;
    }
    socket.emit('init', messages.reverse());
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('A user disconnected');
  });

  // "user is typing" indicator
  socket.on('typing', (author) => {
    socket.broadcast.emit('typing', author);
  });
});

// Serve static files (for the HTML file)
app.use(express.static(__dirname));

// Start the server
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
