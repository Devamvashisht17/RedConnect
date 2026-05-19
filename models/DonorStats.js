const mongoose = require('mongoose');

const donorStatsSchema = new mongoose.Schema({
  user:               { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  totalDonations:     { type: Number, default: 0 },
  verifiedDonations:  { type: Number, default: 0 },
  totalPoints:        { type: Number, default: 0 },
  emergencyDonations: { type: Number, default: 0 },
  rareDonations:      { type: Number, default: 0 },
  livesSaved:         { type: Number, default: 0 },
  donorLevel:         { type: String, enum: ['Newcomer','Bronze','Silver','Gold','Platinum'], default: 'Newcomer' },
  badges: [{
    name:        String,
    icon:        String,
    earnedAt:    { type: Date, default: Date.now },
    description: String
  }],
  achievements: [{
    title:       String,
    description: String,
    earnedAt:    { type: Date, default: Date.now }
  }],
  lastDonationAt: Date,
  cooldownUntil:  Date,
  rank:           { type: Number, default: 0 },
  // Geolocation for matching
  location: {
    type:        { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] }
  },
  isAvailable:    { type: Boolean, default: true },
  bloodGroup:     { type: String }
}, { timestamps: true });

donorStatsSchema.index({ totalPoints: -1 });
donorStatsSchema.index({ location: '2dsphere' });

donorStatsSchema.methods.computeLevel = function () {
  const d = this.verifiedDonations;
  if (d >= 10) return 'Platinum';
  if (d >= 5)  return 'Gold';
  if (d >= 3)  return 'Silver';
  if (d >= 1)  return 'Bronze';
  return 'Newcomer';
};

module.exports = mongoose.model('DonorStats', donorStatsSchema);
