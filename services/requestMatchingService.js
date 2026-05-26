const Donor = require('../models/Donor');
const User = require('../models/User');
const DonorStats = require('../models/DonorStats');
const Notification = require('../models/Notification');

const BLOOD_COMPATIBILITY = {
  'O-': ['O-','O+','A-','A+','B-','B+','AB-','AB+'],
  'O+': ['O+','A+','B+','AB+'],
  'A-': ['A-','A+','AB-','AB+'],
  'A+': ['A+','AB+'],
  'B-': ['B-','B+','AB-','AB+'],
  'B+': ['B+','AB+'],
  'AB-': ['AB-','AB+'],
  'AB+': ['AB+']
};

const VALID_BLOOD_GROUPS = Object.keys(BLOOD_COMPATIBILITY);
const COOLDOWN_DAYS = 90;

const normalize = value => (value || '').toString().trim().toLowerCase();

const isBloodGroupValid = group => VALID_BLOOD_GROUPS.includes(group);

const getCompatibleGroups = group => BLOOD_COMPATIBILITY[group] || [];

async function getCooldownUntil(donor, user) {
  const now = new Date();
  if (donor?.cooldownUntil && donor.cooldownUntil > now) return donor.cooldownUntil;
  if (donor?.lastDonationAt) {
    const nextEligible = new Date(donor.lastDonationAt.getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
    if (nextEligible > now) return nextEligible;
  }
  if (user?._id) {
    const stats = await DonorStats.findOne({ user: user._id }).select('cooldownUntil');
    if (stats?.cooldownUntil && stats.cooldownUntil > now) return stats.cooldownUntil;
  }
  return null;
}

function getSuggestedVisitTime(emergencyLevel) {
  const hours = { Critical: 4, Urgent: 24, Normal: 72 };
  const add = (hours[emergencyLevel] || 24) * 60 * 60 * 1000;
  return new Date(Date.now() + add);
}

function getAppBaseUrl() {
  return (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

async function getDonorUser(donor) {
  if (donor.user) {
    const linkedUser = await User.findById(donor.user).select('_id name email phone city role');
    if (linkedUser) return linkedUser;
  }
  return User.findOne({ email: donor.email }).select('_id name email phone city role');
}

async function findCompatibleDonors({ bloodGroupRequired, city }) {
  const groups = getCompatibleGroups(bloodGroupRequired);
  if (!groups.length) return [];

  const donors = await Donor.find({ bloodGroup: { $in: groups } }).sort({ city: 1, registeredAt: -1 });
  const cityKey = normalize(city);
  const candidates = [];

  for (const donor of donors) {
    const user = await getDonorUser(donor);
    const cityMatch = cityKey && normalize(donor.city) === cityKey;

    if (donor.availability === false) {
      candidates.push({ donor, user, cityMatch, eligible: false, cooldownUntil: null });
      continue;
    }

    const cooldownUntil = await getCooldownUntil(donor, user);
    candidates.push({
      donor,
      user,
      cityMatch,
      eligible: !cooldownUntil,
      cooldownUntil: cooldownUntil || null
    });
  }

  const preferred = candidates.filter(item => item.cityMatch);
  return preferred.length > 0 ? preferred : candidates;
}

async function createDonorNotifications({ request, donors, socketEmitters }) {
  const savedNotifications = [];

  for (const donorEntry of donors) {
    const donorId = donorEntry.donor._id;
    const userId = donorEntry.user?._id || null;

    const notification = await Notification.create({
      recipientType: 'donor',
      donor: donorId,
      user: userId || undefined,
      request: request._id,
      title: `${request.bloodGroupRequired} blood needed`,
      message: `${request.patientName} needs ${request.unitsRequired} unit(s) at ${request.hospitalName}, ${request.city}. Urgency: ${request.emergencyLevel}. Contact: ${request.contactNumber}.`,
      type: 'request-match',
      actionUrl: `/request/${request._id}/matches`,
      metadata: {
        bloodGroupRequired: request.bloodGroupRequired,
        city: request.city,
        emergencyLevel: request.emergencyLevel
      }
    });

    if (socketEmitters && userId) {
      socketEmitters.notifyDonor(userId.toString(), {
        type: 'request-match',
        title: notification.title,
        message: notification.message,
        requestId: request._id.toString(),
        actionUrl: notification.actionUrl
      });
    }

    savedNotifications.push(notification);
  }

  return savedNotifications;
}

async function createRequesterNotification({ request, title, message, type = 'request-accepted' }) {
  return Notification.create({
    recipientType: 'requester',
    request: request._id,
    title,
    message,
    type,
    metadata: {
      contactNumber: request.contactNumber,
      hospitalName: request.hospitalName,
      city: request.city,
      bloodGroupRequired: request.bloodGroupRequired
    }
  });
}

module.exports = {
  BLOOD_COMPATIBILITY,
  VALID_BLOOD_GROUPS,
  isBloodGroupValid,
  getCompatibleGroups,
  findCompatibleDonors,
  createDonorNotifications,
  createRequesterNotification,
  getCooldownUntil,
  getSuggestedVisitTime,
  getAppBaseUrl,
  normalize
};