// sockets/queueSocket.js — All real-time Socket.IO events

const { getQueueSnapshot } = require('../services/queueService');

module.exports = function (io) {

  io.on('connection', (socket) => {
    socket.on('join_admin',         ()       => socket.join('admin'));
    socket.on('join_donor',         (userId) => socket.join(`donor_${userId}`));
    socket.on('join_hospital',      (hId)    => socket.join(`hospital_${hId}`));
    socket.on('join_queue_monitor', async () => {
      socket.join('queue_monitor');
      const snapshot = await getQueueSnapshot();
      socket.emit('queue_snapshot', snapshot);
    });
  });

  // ── Emitters used by controllers ──────────────────────────

  async function broadcastQueueUpdate() {
    const snapshot = await getQueueSnapshot();
    io.to('queue_monitor').emit('queue_snapshot', snapshot);
    io.to('admin').emit('queue_snapshot', snapshot);
  }

  function broadcastEmergency(request) {
    io.emit('emergency_alert', {
      message:    `🚨 CRITICAL: ${request.bloodGroup} blood needed at ${request.hospitalName}`,
      bloodGroup: request.bloodGroup,
      city:       request.city,
      hospital:   request.hospitalName,
      requestId:  request._id
    });
  }

  function notifyDonor(userId, data)    { io.to(`donor_${userId}`).emit('notification', data); }
  function notifyHospital(hId, data)    { io.to(`hospital_${hId}`).emit('notification', data); }
  function notifyAdmin(data)            { io.to('admin').emit('admin_alert', data); }

  return { broadcastQueueUpdate, broadcastEmergency, notifyDonor, notifyHospital, notifyAdmin };
};
