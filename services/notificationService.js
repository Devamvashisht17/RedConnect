// services/notificationService.js
// Socket.IO only — no database notifications

const DonorStats = require('../models/DonorStats');
const mongoose   = require('mongoose');
const { findNearbyDonors } = require('./locationService');

/**
 * Notify all nearby donors about an emergency request via Socket.IO only
 */
async function notifyNearbyDonors(request, io) {
  const compatibleGroups = {
    'O-':  ['O-'],
    'O+':  ['O-','O+'],
    'A-':  ['O-','A-'],
    'A+':  ['O-','O+','A-','A+'],
    'B-':  ['O-','B-'],
    'B+':  ['O-','O+','B-','B+'],
    'AB-': ['O-','A-','B-','AB-'],
    'AB+': ['O-','O+','A-','A+','B-','B+','AB-','AB+']
  };

  const groups = compatibleGroups[request.bloodGroup] || [request.bloodGroup];
  let donors = [];

  // Geo-based matching
  if (request.location?.coordinates &&
      !(request.location.coordinates[0] === 0 && request.location.coordinates[1] === 0)) {
    const result = await findNearbyDonors(
      request.location.coordinates[1],
      request.location.coordinates[0],
      request.bloodGroup,
      { maxRadiusKm: 50 }
    );
    donors = result.donors;
  }

  // Fallback: city-based matching
  if (donors.length === 0 && request.city) {
    const Donor = mongoose.model('Donor');
    const User  = mongoose.model('User');
    const cityDonors = await Donor.find({
      bloodGroup: { $in: groups },
      city: { $regex: new RegExp(request.city, 'i') }
    }).limit(50);

    for (const d of cityDonors) {
      const user = await User.findOne({ email: d.email });
      if (user) donors.push({ user, bloodGroup: d.bloodGroup });
    }
  }

  let count = 0;
  for (const donorStat of donors) {
    const userId = donorStat.user?._id || donorStat.user;
    if (!userId) continue;

    // Socket.IO real-time alert only
    if (io) {
      io.to(`donor_${userId}`).emit('notification', {
        type:    'emergency',
        title:   `🚨 Emergency: ${request.bloodGroup} needed`,
        message: `At ${request.hospitalName || 'a hospital'}, ${request.city}`
      });
    }
    count++;
  }
  return count;
}

module.exports = { notifyNearbyDonors };
