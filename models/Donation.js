const mongoose = require('mongoose');

const donationSchema = new mongoose.Schema({
  donor:           { type: mongoose.Schema.Types.ObjectId, ref: 'Donor', required: true },
  user:            { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
  donorName:       { type: String, required: true },
  bloodGroup:      { type: String, required: true },
  hospital:        { type: String, required: true },
  city:            { type: String, required: true },
  donatedAt:       { type: Date,   default: Date.now },
  isEmergency:     { type: Boolean, default: false },
  status:          { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
  certificateId:   { type: String, default: null },
  certificate:     { type: mongoose.Schema.Types.ObjectId, ref: 'Certificate', default: null },
  verifiedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedAt:      { type: Date },
  rejectedAt:      { type: Date },
  notes:           { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Donation', donationSchema);
