// server.js — Socket.IO entry point
require('dotenv').config();
const http       = require('http');
const { Server } = require('socket.io');
const app        = require('./app');

const PORT   = process.env.PORT || 3000;
const server = http.createServer(app);
const io     = new Server(server);

app.set('io', io);

const socketEmitters = require('./sockets/queueSocket')(io);
app.set('socketEmitters', socketEmitters);

server.listen(PORT, '0.0.0.0', () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
