const mongoose = require('mongoose');

const donationSchema = new mongoose.Schema({
  donor:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  bloodGroup:   { type: String, required: true },
  hospital:     { type: String, required: true },
  hospitalRef:  { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  city:         { type: String, required: true },
  isEmergency:  { type: Boolean, default: false },
  isRareBlood:  { type: Boolean, default: false },
  pointsEarned: { type: Number, default: 0 },
  verifiedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status:       { type: String, enum: ['pending','verified','rejected'], default: 'pending' },
  donatedAt:    { type: Date, default: Date.now }
}, { timestamps: true });

donationSchema.index({ donor: 1, status: 1 });
donationSchema.index({ donatedAt: -1 });

module.exports = mongoose.model('Donation', donationSchema);
