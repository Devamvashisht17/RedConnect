const mongoose = require('mongoose');

const emergencyBroadcastSchema = new mongoose.Schema({
  request:      { type: mongoose.Schema.Types.ObjectId, ref: 'BloodRequest', required: true },
  bloodGroup:   { type: String, required: true },
  hospital:     { type: String, required: true },
  city:         { type: String, required: true },
  message:      { type: String, required: true },
  radiusKm:     { type: Number, default: 10 },
  notifiedCount:{ type: Number, default: 0 },
  respondedCount:{ type: Number, default: 0 },
  status:       { type: String, enum: ['active','fulfilled','expired'], default: 'active' },
  expiresAt:    { type: Date },
  createdAt:    { type: Date, default: Date.now }
}, { timestamps: true });

emergencyBroadcastSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('EmergencyBroadcast', emergencyBroadcastSchema);
