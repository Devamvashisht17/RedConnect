// controllers/gamificationController.js
const mongoose = require('mongoose');
const Donor = require('../models/Donor');
const Request = require('../models/Request');
const Notification = require('../models/Notification');
const Certificate = require('../models/Certificate');
const Donation = require('../models/Donation');
const { refId } = require('../utils/refId');
const { sendRequestMatchedMail } = require('../services/emailService');
const {
  BLOOD_COMPATIBILITY,
  createRequesterNotification,
  normalize
} = require('../services/requestMatchingService');
const { BLOOD_GROUP_OPTIONS } = require('../middleware/authMiddleware');

const ACTIVE_REQUEST_STATUSES = new Set(['pending', 'matched', 'accepted']);
const CLOSED_REQUEST_STATUSES = new Set(['completed', 'fulfilled', 'rejected', 'deleted']);
const URGENCY_ORDER = { Critical: 3, Urgent: 2, Normal: 1 };
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

function synthesizeNotificationItems({ notifications, compatibleRequest }) {
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

  return items
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);
}

async function buildNotificationWidget(user, donorProfile, requestFeed) {
  const notifications = await Notification.find({ recipientType: 'donor', user: user._id })
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();
  const compatibleRequest = (requestFeed || []).find(request => request.isCompatible) || null;

  return synthesizeNotificationItems({ notifications, compatibleRequest });
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

    const User = require('../models/User');
    let donor = await Donor.findOne({ user: req.user._id });
    if (!donor) {
      donor = await Donor.create({
        user: req.user._id,
        name: req.user.name,
        email: req.user.email,
        bloodGroup
      });
    } else {
      donor.bloodGroup = bloodGroup;
      await donor.save();
    }

    // Assign donor role if not already set
    if (!req.user.roles?.includes('donor')) {
      await User.findByIdAndUpdate(req.user._id, { $addToSet: { roles: 'donor' } });
    }

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
    const donorProfile = await resolveDonorProfile(req.user);

    let certificates = [];
    if (donorProfile) {
      certificates = await Certificate.find({ donor: donorProfile._id }).sort({ issuedAt: -1 }).lean();
      if (certificates.length === 0) {
        certificates = await Certificate.find({ user: req.user._id }).sort({ issuedAt: -1 }).lean();
      }
    }
    console.log(`[CERT DASHBOARD] user=${req.user._id} donor=${donorProfile?._id} certs=${certificates.length}`);

    const [requestFeed, notificationsWidget] = await Promise.all([
      buildRequestFeed(req.user),
      buildNotificationWidget(req.user)
    ]);

    res.render('donor/dashboard', {
      user: req.user,
      donorProfile: requestFeed.donorProfile,
      requestFeed: requestFeed.feed,
      requestSummary: requestFeed.summary,
      notificationsWidget,
      certificates
    });
  } catch (err) {
    console.error('Donor dashboard error:', err.message);
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
      return res.status(401).json({ success: false, error: 'Missing authentication.' });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, error: 'Blood request not found.' });
    }

    const donorProfile = await resolveDonorProfile(req.user);
    const request = await Request.findById(req.params.id);

    if (!request) return res.status(404).json({ success: false, error: 'Blood request not found.' });
    if (!donorProfile) return res.status(404).json({ success: false, error: 'Donor profile not found.' });
    if (!req.user.roles?.includes('donor')) return res.status(403).json({ success: false, error: 'User is not registered as a donor.' });
    if (!isRequestOpen(request)) return res.status(404).json({ success: false, error: 'Request is no longer available.' });
    if (!isCompatible(donorProfile.bloodGroup, request.bloodGroupRequired)) {
      return res.status(400).json({ success: false, error: 'Your blood type does not match this request.' });
    }

    const donorId = donorProfile._id.toString();
    const userId  = req.user._id.toString();
    const now     = new Date();
    const { getSuggestedVisitTime } = require('../services/requestMatchingService');
    const { sendDonorScreeningVisitMail } = require('../services/emailService');
    const visitTime = getSuggestedVisitTime(request.emergencyLevel);

    const existingIndex = (request.matchedDonors || []).findIndex(
      entry => refId(entry.donor) === donorId || refId(entry.user) === userId
    );

    if (existingIndex >= 0) {
      // Already in list — update to scheduled
      request.matchedDonors[existingIndex].responseStatus   = 'accepted';
      request.matchedDonors[existingIndex].healthStatus     = 'scheduled';
      request.matchedDonors[existingIndex].respondedAt      = now;
      request.matchedDonors[existingIndex].scheduledVisitAt = visitTime;
      request.matchedDonors[existingIndex].note             = 'Responded from donor dashboard';
    } else {
      // New entry
      request.matchedDonors = request.matchedDonors || [];
      request.matchedDonors.push({
        donor:            donorProfile._id,
        user:             req.user._id,
        cityMatch:        normalize(donorProfile.city) === normalize(request.city),
        notifiedAt:       now,
        responseStatus:   'accepted',
        healthStatus:     'scheduled',
        respondedAt:      now,
        scheduledVisitAt: visitTime,
        note:             'Responded from donor dashboard'
      });
    }

    // Ensure request status is visible to admin screening query
    if (!['accepted', 'matched'].includes(request.status)) {
      request.status = 'accepted';
    } else if (request.status === 'matched') {
      request.status = 'accepted';
    }
    request.awaitingAdminVerification = true;
    request.markModified('matchedDonors');
    await request.save();

    // Send screening appointment email to donor
    try {
      await sendDonorScreeningVisitMail(donorProfile, request, visitTime);
    } catch (mailErr) {
      console.error('Screening visit email error:', mailErr.message);
    }

    // Notify requester
    try {
      await createRequesterNotification({
        request,
        title: 'Donor responded to your request',
        message: `${donorProfile.name} is available and has been sent a screening appointment for ${request.bloodGroupRequired} support in ${request.city}.`,
        type: 'request-accepted'
      });
    } catch (notifErr) {
      console.error('Requester notification error:', notifErr.message);
    }

    // Email requester only now that a donor has actually responded
    if (request.requesterEmail) {
      sendRequestMatchedMail(request, null, 1).catch(e => console.error('Requester response email:', e.message));
    }
    res.json({
      success: true,
      message: 'Your response has been sent. Check your email for the screening appointment details.',
      requestId: request._id.toString()
    });
  } catch (err) {
    console.error('Donor respond error:', err.message);
    res.status(500).json({ success: false, error: 'Something went wrong.' });
  }
};

exports.updateLocation = async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const donor = await Donor.findOne({ user: req.user._id });
    if (!donor) return res.status(404).json({ error: 'Donor not found.' });
    await donor.save();
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

exports.myDonations = async (req, res) => {
  try {
    const donorProfile = await resolveDonorProfile(req.user);
    const donations = donorProfile
      ? await Donation.find({ donor: donorProfile._id }).sort({ donatedAt: -1 }).lean()
      : [];
    res.render('donor/my-donations', { user: req.user, donor: donorProfile, donations });
  } catch (err) {
    console.error('My donations error:', err.message);
    res.status(500).send('Something went wrong.');
  }
};

exports.logDonation = async (req, res) => {
  try {
    const donorProfile = await resolveDonorProfile(req.user);
    if (!donorProfile) return res.status(404).json({ success: false, error: 'Donor profile not found.' });

    const { bloodGroup, hospital, city, donatedAt, isEmergency } = req.body;
    if (!bloodGroup || !hospital || !city || !donatedAt) {
      return res.status(400).json({ success: false, error: 'All fields are required.' });
    }

    await Donation.create({
      donor:       donorProfile._id,
      user:        req.user._id,
      donorName:   donorProfile.name,
      bloodGroup,
      hospital,
      city,
      donatedAt:   new Date(donatedAt),
      isEmergency: isEmergency === 'on' || isEmergency === true
    });

    res.json({ success: true, message: 'Donation submitted for verification.' });
  } catch (err) {
    console.error('Log donation error:', err.message);
    res.status(500).json({ success: false, error: 'Something went wrong.' });
  }
};
