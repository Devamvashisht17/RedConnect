const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema({
  certificateId: { type: String, required: true, unique: true },
  donor:         { type: mongoose.Schema.Types.ObjectId, ref: 'Donor', required: true },
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  request:       { type: mongoose.Schema.Types.ObjectId, ref: 'Request' },
  donorName:     { type: String, required: true },
  bloodGroup:    { type: String, required: true },
  hospital:      { type: String, required: true },
  city:          { type: String, required: true },
  donatedAt:     { type: Date, default: Date.now },
  issuedAt:      { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Certificate', certificateSchema);
