const mongoose = require('mongoose');

const queueSchema = new mongoose.Schema({
  request:        { type: mongoose.Schema.Types.ObjectId, ref: 'BloodRequest', required: true, unique: true },
  queueLevel:     { type: String, enum: ['critical','emergency','priority','normal'], required: true },
  priorityScore:  { type: Number, default: 0 },
  position:       { type: Number, default: 0 },
  estimatedWait:  { type: Number, default: 0 },
  assignedDonors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  status:         { type: String, enum: ['waiting','matched','fulfilled','expired'], default: 'waiting' },
  enteredAt:      { type: Date, default: Date.now },
  fulfilledAt:    Date
}, { timestamps: true });

queueSchema.index({ queueLevel: 1, priorityScore: -1 });
queueSchema.index({ status: 1 });

module.exports = mongoose.model('Queue', queueSchema);
