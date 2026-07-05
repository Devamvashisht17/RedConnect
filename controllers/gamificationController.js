// controllers/gamificationController.js
const mongoose = require('mongoose');
const Donor = require('../models/Donor');
const Request = require('../models/Request');
const DonorStats = require('../models/DonorStats');
const Donation = require('../models/Donation');
const Notification = require('../models/Notification');
const { refId } = require('../utils/refId');
const {
  BLOOD_COMPATIBILITY,
  createRequesterNotification,
  normalize
} = require('../services/requestMatchingService');
const { getLeaderboard, isInCooldown, getNextLevelInfo } = require('../services/gamificationService');
const { BLOOD_GROUP_OPTIONS } = require('../middleware/authMiddleware');

const ACTIVE_REQUEST_STATUSES = new Set(['pending', 'matched', 'accepted']);
const CLOSED_REQUEST_STATUSES = new Set(['completed', 'fulfilled', 'rejected', 'deleted']);
const URGENCY_ORDER = { Critical: 3, Urgent: 2, Normal: 1 };
const DONATION_STATUS_MAP = {
  verified: { label: 'Completed', tone: 'completed' },
  pending: { label: 'Scheduled', tone: 'scheduled' },
  rejected: { label: 'Cancelled', tone: 'cancelled' }
};
const HISTORY_FILTER_STATUS = {
  all: null,
  completed: 'verified',
  scheduled: 'pending',
  cancelled: 'rejected'
};

function normalizeStatus(status) {
  return (status || '').toString().trim().toLowerCase();
}

function urgencyRank(level) {
  return URGENCY_ORDER[level] || 0;
}

function isRequestOpen(request) {
  const status = normalizeStatus(request.status);
  return ACTIVE_REQUEST_STATUSES.has(status) && !CLOSED_REQUEST_STATUSES.has(status);
}

function isCompatible(donorBloodGroup, requestBloodGroup) {
  if (!donorBloodGroup || !requestBloodGroup) return false;
  return (BLOOD_COMPATIBILITY[donorBloodGroup] || []).includes(requestBloodGroup);
}

function requestFallbackName(request) {
  return request.patientName || `Request ${String(request._id).slice(-6).toUpperCase()}`;
}

function requestTimeValue(request) {
  return request.createdAt || request.timestamp || new Date(0);
}

function formatDateValue(date) {
  if (!date) return 'N/A';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleString();
}

function formatDateOnly(date) {
  if (!date) return 'N/A';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleDateString();
}

function donationDisplayStatus(status) {
  const normalized = normalizeStatus(status);
  return DONATION_STATUS_MAP[normalized] || { label: 'Scheduled', tone: 'scheduled' };
}

function donationTypeLabel(donation) {
  return donation.isEmergency ? 'Emergency Donation' : 'Regular Donation';
}

function nextEligibleFromDonation(donation) {
  if (!donation?.donatedAt) return null;
  return new Date(new Date(donation.donatedAt).getTime() + 90 * 24 * 60 * 60 * 1000);
}

function cooldownProgress(lastDonationAt, nextEligibleAt) {
  if (!lastDonationAt || !nextEligibleAt) return 100;
  const start = new Date(lastDonationAt).getTime();
  const end = new Date(nextEligibleAt).getTime();
  const now = Date.now();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 100;
  if (now <= start) return 0;
  if (now >= end) return 100;
  return Math.max(0, Math.min(100, Math.round(((now - start) / (end - start)) * 100)));
}

function buildDonationCard(donation) {
  const status = donationDisplayStatus(donation.status);
  return {
    _id: donation._id,
    donatedAt: donation.donatedAt || donation.createdAt,
    bloodGroup: donation.bloodGroup,
    hospital: donation.hospital,
    city: donation.city,
    donationType: donationTypeLabel(donation),
    statusLabel: status.label,
    statusTone: status.tone,
    recipientName: donation.recipientName || 'Anonymous Recipient',
    requestId: donation.requestId || donation.request?.toString?.() || null,
    requestLabel: donation.requestId || donation.request ? `Request #${String(donation.requestId || donation.request).slice(-6).toUpperCase()}` : null
  };
}

function synthesizeNotificationItems({ notifications, latestDonation, nextEligibleDate, compatibleRequest }) {
  const items = [];

  for (const notification of notifications) {
    items.push({
      _id: notification._id,
      icon: notification.type === 'request-accepted' ? '✅' : notification.type === 'request-declined' ? '⚪' : notification.type === 'request-match' ? '🩸' : '🔔',
      title: notification.title,
      message: notification.message,
      createdAt: notification.createdAt,
      tone: notification.type === 'request-declined' ? 'muted' : notification.type === 'request-accepted' ? 'good' : 'neutral'
    });
  }

  if (latestDonation) {
    items.push({
      _id: `donation-${latestDonation._id}`,
      icon: '🧾',
      title: 'Donation verified',
      message: `Your ${latestDonation.bloodGroup} donation at ${latestDonation.hospital} was recorded successfully.`,
      createdAt: latestDonation.donatedAt,
      tone: 'good'
    });
  }

  if (compatibleRequest) {
    items.push({
      _id: `request-${compatibleRequest.requestId}`,
      icon: '🚨',
      title: 'Compatible blood request available',
      message: `${compatibleRequest.patientName} needs ${compatibleRequest.bloodGroupRequired} blood in ${compatibleRequest.city}.`,
      createdAt: compatibleRequest.createdAt,
      tone: compatibleRequest.emergencyLevel === 'Critical' ? 'critical' : 'urgent'
    });
  }

  if (nextEligibleDate) {
    const isEligible = nextEligibleDate.getTime() <= Date.now();
    items.push({
      _id: 'eligibility-reminder',
      icon: isEligible ? '🎉' : '⏳',
      title: isEligible ? 'Eligible to donate again' : 'Donation reminder',
      message: isEligible
        ? 'You can schedule your next donation now.'
        : `You can donate again on ${formatDateOnly(nextEligibleDate)}.`,
      createdAt: nextEligibleDate,
      tone: isEligible ? 'good' : 'neutral'
    });
  }

  return items
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);
}

async function buildDonationHistory(user, filters = {}) {
  const donorStats = await DonorStats.findOne({ user: user._id });
  const baseQuery = { donor: user._id };
  const year = filters.year && filters.year !== 'all' ? Number(filters.year) : null;
  const statusKey = (filters.status || 'all').toString().toLowerCase();
  const status = HISTORY_FILTER_STATUS[statusKey];

  if (status) baseQuery.status = status;

  const donations = await Donation.find(baseQuery).sort({ donatedAt: -1 }).lean();
  const filtered = year
    ? donations.filter(donation => new Date(donation.donatedAt).getFullYear() === year)
    : donations;

  const verifiedDonations = donations.filter(donation => normalizeStatus(donation.status) === 'verified');
  const latestDonation = donations[0] || null;
  const latestVerifiedDonation = verifiedDonations[0] || null;
  const eligibleDate = donorStats?.cooldownUntil || nextEligibleFromDonation(latestVerifiedDonation || latestDonation);

  return {
    donations: filtered.map(buildDonationCard),
    summary: {
      totalDonations: donations.length,
      lastDonationDate: latestDonation?.donatedAt || null,
      nextEligibleDonationDate: eligibleDate,
      livesHelped: donorStats?.livesSaved || verifiedDonations.length
    },
    latestVerifiedDonations: verifiedDonations.slice(0, 5).map(buildDonationCard),
    historyYears: Array.from(new Set(donations.map(donation => new Date(donation.donatedAt).getFullYear()).filter(Number.isFinite))).sort((a, b) => b - a),
    selectedYear: year ? String(year) : 'all',
    selectedStatus: statusKey,
    nextEligibleDate: eligibleDate,
    cooldownProgress: cooldownProgress(latestVerifiedDonation?.donatedAt || latestDonation?.donatedAt, eligibleDate)
  };
}

async function buildNotificationWidget(user, donorProfile, requestFeed) {
  const notifications = await Notification.find({ recipientType: 'donor', user: user._id })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();
  const donationHistory = await Donation.find({ donor: user._id }).sort({ donatedAt: -1 }).limit(1).lean();
  const latestDonation = donationHistory[0] || null;
  const compatibleRequest = (requestFeed || []).find(request => request.isCompatible) || null;
  const nextEligibleDate = latestDonation ? nextEligibleFromDonation(latestDonation) : null;

  return synthesizeNotificationItems({
    notifications,
    latestDonation,
    nextEligibleDate,
    compatibleRequest
  });
}

function toFeedItem(request, donorProfile, user) {
  const donorBloodGroup = donorProfile?.bloodGroup || '';
  const compatible = isCompatible(donorBloodGroup, request.bloodGroupRequired);
  const respondingMatch = (request.matchedDonors || []).find(entry => {
    const donorId = donorProfile?._id ? donorProfile._id.toString() : null;
    return (donorId && refId(entry.donor) === donorId) || (user?._id && refId(entry.user) === user._id.toString());
  });

  return {
    _id: request._id,
    patientName: requestFallbackName(request),
    bloodGroupRequired: request.bloodGroupRequired,
    city: request.city || request.location?.city || 'Unknown location',
    area: request.location?.area || request.location?.district || '',
    emergencyLevel: request.emergencyLevel || 'Normal',
    createdAt: requestTimeValue(request),
    donorBloodGroup,
    isCompatible: compatible,
    compatibilityLabel: compatible ? 'Compatible' : 'Not Compatible',
    compatibilityTone: donorBloodGroup
      ? compatible ? 'good' : 'warn'
      : 'neutral',
    priorityLabel: normalizeStatus(request.emergencyLevel) === 'critical'
      ? 'Top priority'
      : normalizeStatus(request.emergencyLevel) === 'urgent'
        ? 'High priority'
        : 'Standard priority',
    urgencyRank: urgencyRank(request.emergencyLevel),
    hasResponded: Boolean(respondingMatch),
    responseStatus: respondingMatch?.responseStatus || null,
    respondedAt: respondingMatch?.respondedAt || null,
    status: request.status,
    hospitalName: request.hospitalName,
    unitsRequired: request.unitsRequired,
    additionalMessage: request.additionalMessage || '',
    requestId: request._id.toString()
  };
}

async function resolveDonorProfile(user) {
  if (!user) return null;
  if (user._id) {
    const donorByUser = await Donor.findOne({ user: user._id }).lean();
    if (donorByUser) return donorByUser;
  }
  if (user.email) {
    return Donor.findOne({ email: user.email }).lean();
  }
  return null;
}

function isValidBloodGroup(value) {
  return BLOOD_GROUP_OPTIONS.includes(String(value || '').trim());
}

exports.getCompleteProfile = async (req, res) => {
  try {
    const donorProfile = await resolveDonorProfile(req.user);
    if (isValidBloodGroup(donorProfile?.bloodGroup)) {
      return res.redirect('/donor/dashboard');
    }

    return res.render('donor/complete-profile', {
      user: req.user,
      donorProfile,
      bloodGroupOptions: BLOOD_GROUP_OPTIONS
    });
  } catch (err) {
    console.error('Complete profile page error:', err.message);
    res.status(500).send('Something went wrong.');
  }
};

exports.patchProfile = async (req, res) => {
  try {
    const bloodGroup = String(req.body?.bloodGroup || '').trim();
    if (!isValidBloodGroup(bloodGroup)) {
      return res.status(400).json({ success: false, error: 'Please select a valid blood group.' });
    }

    const donor = await Donor.findOne({ user: req.user._id });
    if (!donor) {
      return res.status(404).json({ success: false, error: 'Donor profile not found.' });
    }

    donor.bloodGroup = bloodGroup;
    await donor.save();

    res.json({ success: true, donor: { bloodGroup: donor.bloodGroup } });
  } catch (err) {
    console.error('Patch donor profile error:', err.message);
    res.status(500).json({ success: false, error: 'Something went wrong.' });
  }
};

async function buildRequestFeed(user, filters = {}) {
  const donorProfile = await resolveDonorProfile(user);
  const compatibleOnly = String(filters.compatibleOnly).toLowerCase() === 'true';
  const urgencyFilter = (filters.urgency || 'all').toString().trim();

  const openRequests = await Request.find({
    status: { $in: [...ACTIVE_REQUEST_STATUSES] }
  }).sort({ createdAt: -1 }).lean();

  const feed = openRequests
    .map(request => toFeedItem(request, donorProfile, user))
    .filter(item => !compatibleOnly || item.isCompatible)
    .filter(item => urgencyFilter === 'all' || item.emergencyLevel === urgencyFilter)
    .sort((a, b) => {
      if (a.isCompatible !== b.isCompatible) return Number(b.isCompatible) - Number(a.isCompatible);
      if (b.urgencyRank !== a.urgencyRank) return b.urgencyRank - a.urgencyRank;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

  return {
    donorProfile,
    feed,
    summary: {
      total: feed.length,
      compatible: feed.filter(item => item.isCompatible).length,
      critical: feed.filter(item => item.emergencyLevel === 'Critical').length,
      urgent: feed.filter(item => item.emergencyLevel === 'Urgent').length
    }
  };
}

exports.dashboard = async (req, res) => {
  try {
    let stats = await DonorStats.findOne({ user: req.user._id });
    if (!stats) stats = await DonorStats.create({ user: req.user._id });

    const [leaderboard, requestFeed, donationHistory, notificationsWidget] = await Promise.all([
      getLeaderboard(10),
      buildRequestFeed(req.user),
      buildDonationHistory(req.user),
      buildNotificationWidget(req.user)
    ]);

    const rank = await DonorStats.countDocuments({ totalPoints: { $gt: stats.totalPoints } }) + 1;
    const cooldown = await isInCooldown(req.user._id);
    const nextLevelInfo = getNextLevelInfo(stats);

    res.render('donor/dashboard', {
      user: req.user,
      stats,
      donations: [],
      leaderboard,
      rank,
      cooldown,
      nextLevelInfo,
      donorProfile: requestFeed.donorProfile,
      requestFeed: requestFeed.feed,
      requestSummary: requestFeed.summary,
      donationHistoryPreview: donationHistory.latestVerifiedDonations,
      donationHistorySummary: donationHistory.summary,
      eligibility: {
        eligibleDate: donationHistory.nextEligibleDate,
        countdownText: donationHistory.nextEligibleDate
          ? (donationHistory.nextEligibleDate.getTime() <= Date.now()
            ? 'Eligible now'
            : `${Math.max(1, Math.ceil((donationHistory.nextEligibleDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))} day(s) left`)
          : 'No active waiting period',
        progress: donationHistory.cooldownProgress
      },
      notificationsWidget
    });
  } catch (err) {
    console.error('Donor dashboard error:', err.message);
    res.status(500).send('Something went wrong.');
  }
};

exports.historyPage = async (req, res) => {
  try {
    const history = await buildDonationHistory(req.user, req.query);
    res.render('donor/history', {
      user: req.user,
      summary: history.summary,
      donations: history.donations,
      historyYears: history.historyYears,
      selectedYear: history.selectedYear,
      selectedStatus: history.selectedStatus,
      nextEligibleDate: history.nextEligibleDate,
      cooldownProgress: history.cooldownProgress
    });
  } catch (err) {
    console.error('Donation history error:', err.message);
    res.status(500).send('Something went wrong.');
  }
};

exports.notificationsPage = async (req, res) => {
  try {
    const [requestFeed, donorProfile] = await Promise.all([
      buildRequestFeed(req.user),
      resolveDonorProfile(req.user)
    ]);
    const notifications = await buildNotificationWidget(req.user, donorProfile, requestFeed.feed);

    res.render('donor/notifications', {
      user: req.user,
      donorProfile,
      requestOffers: requestFeed.feed.filter(request => request.isCompatible),
      notifications
    });
  } catch (err) {
    console.error('Donor notifications error:', err.message);
    res.status(500).send('Something went wrong.');
  }
};

exports.getRequestsFeed = async (req, res) => {
  try {
    const requestFeed = await buildRequestFeed(req.user, req.query);
    res.json({
      success: true,
      donorProfile: requestFeed.donorProfile,
      summary: requestFeed.summary,
      requests: requestFeed.feed
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.requestDetails = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).render('404');
    }

    console.log('Donor request details debug:', {
      userId: req.user?._id?.toString(),
      userRole: req.user?.roles,
      requestId: req.params.id
    });

    const [request, donorProfile] = await Promise.all([
      Request.findById(req.params.id).lean(),
      resolveDonorProfile(req.user)
    ]);

    if (!request) {
      console.error('Donor request details: blood request not found.', { requestId: req.params.id });
      return res.status(404).render('404');
    }

    if (!donorProfile) {
      console.error('Donor request details: donor profile not found.', { userId: req.user?._id?.toString() });
      return res.status(404).render('404');
    }

    if (!isRequestOpen(request)) {
      return res.status(404).render('404');
    }

    res.render('donor/request-details', {
      user: req.user,
      donorProfile,
      request: toFeedItem(request, donorProfile, req.user)
    });
  } catch (err) {
    console.error('Donor request details error:', err.message);
    res.status(500).send('Something went wrong.');
  }
};

exports.respondToRequest = async (req, res) => {
  try {
    if (!req.user) {
      console.error('Donor respond: missing authentication.', { requestId: req.params.id });
      return res.status(401).json({ success: false, error: 'Missing authentication.' });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      console.error('Donor respond: invalid request id.', { requestId: req.params.id, userId: req.user._id?.toString(), userRole: req.user.roles });
      return res.status(404).json({ success: false, error: 'Blood request not found.' });
    }

    const donorProfile = await resolveDonorProfile(req.user);
    const request = await Request.findById(req.params.id);

    console.log('Donor respond debug:', {
      loggedInUser: req.user?._id?.toString(),
      userRole: req.user?.roles,
      requestId: req.params.id,
      request: request ? { id: request._id.toString(), status: request.status, bloodGroupRequired: request.bloodGroupRequired } : null,
      donor: donorProfile ? { id: donorProfile._id.toString(), bloodGroup: donorProfile.bloodGroup, user: donorProfile.user?.toString() } : null
    });

    if (!request) {
      console.error('Donor respond: blood request not found.', { requestId: req.params.id, userId: req.user._id?.toString() });
      return res.status(404).json({ success: false, error: 'Blood request not found.' });
    }

    if (!donorProfile) {
      console.error('Donor respond: donor profile not found.', { userId: req.user._id?.toString() });
      return res.status(404).json({ success: false, error: 'Donor profile not found.' });
    }

    if (!req.user.roles?.includes('donor')) {
      console.error('Donor respond: user is not registered as a donor.', { userId: req.user._id?.toString(), roles: req.user.roles });
      return res.status(403).json({ success: false, error: 'User is not registered as a donor.' });
    }

    if (!isRequestOpen(request)) {
      return res.status(404).json({ success: false, error: 'Request is no longer available.' });
    }

    if (!isCompatible(donorProfile.bloodGroup, request.bloodGroupRequired)) {
      return res.status(400).json({ success: false, error: 'Your blood type does not match this request.' });
    }

    const donorId = donorProfile._id.toString();
    const userId = req.user._id.toString();
    const now = new Date();
    const responseEntryIndex = (request.matchedDonors || []).findIndex(entry => {
      return refId(entry.donor) === donorId || refId(entry.user) === userId;
    });

    if (responseEntryIndex >= 0) {
      request.matchedDonors[responseEntryIndex].responseStatus = 'accepted';
      request.matchedDonors[responseEntryIndex].respondedAt = now;
      request.matchedDonors[responseEntryIndex].note = 'Responded from donor dashboard';
    } else {
      request.matchedDonors = request.matchedDonors || [];
      request.matchedDonors.push({
        donor: donorProfile._id,
        user: req.user._id,
        cityMatch: normalize(donorProfile.city) === normalize(request.city),
        notifiedAt: now,
        responseStatus: 'accepted',
        healthStatus: 'pending',
        respondedAt: now,
        note: 'Responded from donor dashboard'
      });
    }

    request.markModified('matchedDonors');
    await request.save();

    try {
      await createRequesterNotification({
        request,
        title: 'Donor responded to your request',
        message: `${req.user.name} is available for ${request.bloodGroupRequired} support in ${request.city}.`,
        type: 'request-accepted'
      });
    } catch (notifErr) {
      console.error('Requester notification error:', notifErr.message);
    }

    res.json({
      success: true,
      message: 'Your availability has been sent.',
      requestId: request._id.toString()
    });
  } catch (err) {
    console.error('Donor respond error:', err.message);
    res.status(500).json({ success: false, error: 'Something went wrong.' });
  }
};

exports.leaderboard = async (req, res) => {
  try {
    const leaderboard = await getLeaderboard(20);
    res.render('donor/leaderboard', { user: req.user, leaderboard });
  } catch (err) {
    res.status(500).send('Something went wrong.');
  }
};

exports.logDonation = async (req, res) => {
  try {
    const cooldown = await isInCooldown(req.user._id);
    if (cooldown) { req.flash('error', 'You are in a 90-day cooldown period.'); return res.redirect('/donor/dashboard'); }
    const { bloodGroup, hospital, city, isEmergency } = req.body;
    await Donation.create({
      donor: req.user._id, bloodGroup, hospital, city,
      isEmergency: isEmergency === 'on',
      isRareBlood: ['AB-','B-','A-','O-'].includes(bloodGroup),
      status: 'pending'
    });
    req.flash('success', 'Donation logged! Awaiting admin verification.');
    res.redirect('/donor/dashboard');
  } catch (err) {
    res.status(500).send('Something went wrong.');
  }
};

exports.updateLocation = async (req, res) => {
  try {
    const { lat, lng, bloodGroup } = req.body;
    await DonorStats.findOneAndUpdate(
      { user: req.user._id },
      { location: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] }, bloodGroup, isAvailable: true },
      { upsert: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.setAvailability = async (req, res) => {
  try {
    const { available, note } = req.body;
    const donor = await Donor.findOne({ user: req.user._id });
    if (!donor) return res.status(404).json({ success: false, error: 'Donor profile not found.' });

    donor.availability = available === true || available === 'true';
    donor.availabilityNote = String(note || '').trim();
    await donor.save();

    await Notification.create({
      recipientType: 'donor',
      user: req.user._id,
      request: null,
      title: 'Availability updated',
      message: donor.availability ? 'You are now available for emergency requests.' : 'You are now marked unavailable.',
      type: 'availability-update',
      actionUrl: '/donor/dashboard'
    });

    res.json({ success: true, availability: donor.availability });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
