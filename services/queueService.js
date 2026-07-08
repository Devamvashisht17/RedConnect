// services/queueService.js

const Queue      = require('../models/Queue');
const { calculatePriorityScore, getQueueLevel, estimateWaitTime } = require('./priorityService');

async function enqueue(request, requesterUserId = null) {
  const score      = calculatePriorityScore(request, null);
  const queueLevel = getQueueLevel(request.emergencyLevel);
  const position   = await Queue.countDocuments({ queueLevel, status: 'waiting' });

  const entry = await Queue.create({
    request: request._id, queueLevel,
    priorityScore: score, position: position + 1,
    estimatedWait: estimateWaitTime(position + 1, queueLevel)
  });

  await recalculatePositions(queueLevel);
  return entry;
}

async function recalculatePositions(queueLevel) {
  const entries = await Queue.find({ queueLevel, status: 'waiting' }).sort({ priorityScore: -1 });
  for (let i = 0; i < entries.length; i++) {
    entries[i].position      = i + 1;
    entries[i].estimatedWait = estimateWaitTime(i + 1, queueLevel);
    await entries[i].save();
  }
}

async function getQueueSnapshot() {
  const levels   = ['critical', 'emergency', 'priority', 'normal'];
  const snapshot = {};
  for (const level of levels) {
    snapshot[level] = await Queue.find({ queueLevel: level, status: 'waiting' })
      .sort({ priorityScore: -1 })
      .populate({ path: 'request', select: 'patientName bloodGroup emergencyLevel city hospitalName contactPhone' });
  }
  return snapshot;
}

async function fulfillRequest(requestId) {
  const entry = await Queue.findOne({ request: requestId });
  if (!entry) return null;
  entry.status = 'fulfilled'; entry.fulfilledAt = new Date();
  await entry.save();
  await recalculatePositions(entry.queueLevel);
  return entry;
}

async function getPosition(requestId) {
  return Queue.findOne({ request: requestId }).select('position estimatedWait queueLevel priorityScore');
}

module.exports = { enqueue, getQueueSnapshot, fulfillRequest, getPosition, recalculatePositions };
