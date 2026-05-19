// server.js — Socket.IO entry point
// Run with: node server.js  (instead of node app.js)

require('dotenv').config();
const http   = require('http');
const { Server } = require('socket.io');
const app    = require('./app');

const PORT   = process.env.PORT || 3000;
const server = http.createServer(app);
const io     = new Server(server);

// Attach io to app so controllers can access it
app.set('io', io);

// Initialize socket handlers and attach emitters to app
const socketEmitters = require('./sockets/queueSocket')(io);
app.set('socketEmitters', socketEmitters);

server.listen(PORT, '0.0.0.0', () =>
  console.log(`🚀 RedConnect running on http://localhost:${PORT}`)
);
