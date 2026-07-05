const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const Request = require('../models/Request');
const User = require('../models/User');
require('../models/Donor');
const Notification = require('../models/Notification');
const { refId } = require('../utils/refId');
const {
  isBloodGroupValid,
  createRequesterNotification,
  getSuggestedVisitTime
} = require('../services/requestMatchingService');
const { isSmtpConfigured } = require('../services/emailService');
const { syncDonorsAndNotify, emailRequesterSubmitted } = require('../services/requestNotifyService');
const { healthCheckToken, verifyHealthCheckToken, normalizeToken } = require('../utils/requestToken');
const { handleDonorUnavailable } = require('../services/donorRescheduleService');

function matchDonorId(entry) {
  return refId(entry?.donor);
}

function acceptedDonorId(request) {
  return refId(request?.acceptedDonor);
}

async function resolveAuthenticatedEmail(req) {
  const token = req.cookies?.token;

  if (!token || !process.env.JWT_SECRET) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('email');
    return user?.email || null;
  } catch (err) {
    return null;
  }
}

exports.getRequest = (req, res) => res.render('request');

exports.postRequest = async (req, res) => {
  try {
    const {
      patientName,
      bloodGroup,
      hospitalName,
      city,
      contactName,
      contactPhone,
      contactEmail,
      emergencyLevel
    } = req.body;

    if (!isBloodGroupValid(bloodGroup)) {
      return res.redirect('/request');
    }

    const authenticatedEmail = await resolveAuthenticatedEmail(req);
    const requesterEmail = (authenticatedEmail || contactEmail || '').trim().toLowerCase() || undefined;

    let request = await Request.create({
      patientName,
      bloodGroupRequired: bloodGroup,
      bloodGroup,
      unitsRequired: 1,
      hospitalName,
      city,
      contactName,
      contactNumber: contactPhone,
      contactPhone,
      emergencyLevel: emergencyLevel || 'Normal',
      requesterEmail,
      status: 'pending',
      additionalMessage: emergencyLevel === 'Critical' ? 'Emergency blood request submitted through RedConnect.' : ''
    });

    request.matchedDonors = [];
    await request.save();

    const socketEmitters = req.app.get('socketEmitters');

    try {
      await emailRequesterSubmitted(request);
    } catch (mailErr) {
      console.error('Requester email error:', mailErr.message);
    }

    let notifyResult = { totalMatched: 0, newlyNotified: [], eligibleCount: 0, cooldownCount: 0 };
    try {
      notifyResult = await syncDonorsAndNotify(request, socketEmitters);
      request = notifyResult.request;
    } catch (mailErr) {
      console.error('Donor notify error:', mailErr.message);
    }

    if (notifyResult.totalMatched > 0) {
      let msg = `We emailed ${notifyResult.newlyNotified.length} donor(s) to come for doctor screening at the hospital.`;
      if (notifyResult.cooldownCount > 0) {
        msg += ` ${notifyResult.cooldownCount} compatible donor(s) are on the 90-day cooldown and are shown on the matches page.`;
      }
      await createRequesterNotification({
        request,
        title: `${notifyResult.totalMatched} compatible donor(s) found`,
        message: msg,
        type: 'request-match'
      });
    } else {
      await createRequesterNotification({
        request,
        title: 'Request submitted — searching for donors',
        message: 'No compatible donors in the database yet. Register donors or revisit the matches page later.',
        type: emergencyLevel === 'Critical' ? 'emergency-alert' : 'admin-alert'
      });
    }

    res.redirect('/requester/dashboard');
  } catch (err) {
    console.error('Blood request error:', err.message);
    res.redirect('/request');
  }
};

exports.getMatches = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).render('404');
    }

    let request = await Request.findById(id);

    if (!request) return res.status(404).render('404');

    const socketEmitters = req.app.get('socketEmitters');
    let newlyNotified = [];

    if (!request.acceptedDonor) {
      try {
        const result = await syncDonorsAndNotify(request, socketEmitters);
        request = result.request;
        newlyNotified = result.newlyNotified;
        if (newlyNotified.length > 0) {
          console.log(`📧 Emailed ${newlyNotified.length} newly matched donor(s) for request ${request._id}`);
        }
      } catch (mailErr) {
        console.error('Re-match email error:', mailErr.message);
      }
    }

    await request.populate([
      { path: 'matchedDonors.donor', select: 'name email phone bloodGroup city' },
      { path: 'acceptedDonor', select: 'name email phone bloodGroup city' }
    ]);

    const requestNotifications = await Notification.find({ request: request._id })
      .sort({ createdAt: -1 })
      .limit(20);

    const acceptedId = acceptedDonorId(request);
    const acceptedEntry = request.matchedDonors?.find(
      m => matchDonorId(m) === acceptedId
    );

    const matched = request.matchedDonors || [];
    const eligibleCount = matched.filter(m => m.healthStatus === 'scheduled').length;
    const cooldownCount = matched.filter(m => m.healthStatus === 'cooldown').length;

    res.render('request-matches', {
      request,
      acceptedDonorId: acceptedId,
      compatibleDonorCount: request.compatibleDonorCount || matched.length,
      eligibleCount,
      cooldownCount,
      requestNotifications,
      acceptedEntry,
      visitTime: acceptedEntry?.scheduledVisitAt || request.scheduledVisitAt || null,
      justConfirmed: req.query.confirmed === '1',
      smtpConfigured: isSmtpConfigured(),
      newlyNotifiedCount: newlyNotified.length
    });
  } catch (err) {
    console.error('getMatches error:', err.message, err.stack);
    if (err.name === 'CastError' || err.name === 'MissingSchemaError') {
      return res.status(404).render('404');
    }
    res.status(500).send('Something went wrong loading matched donors. Please try again later.');
  }
};

exports.getHealthCheck = async (req, res) => {
  try {
    const { requestId, donorId } = req.params;
    const token = normalizeToken(req.query.token);

    if (!verifyHealthCheckToken(requestId, donorId, token)) {
      return res.status(403).render('donor/health-check', {
        error: 'Invalid or expired link. Please use the link from your email.',
        request: null,
        donor: null,
        token: null
      });
    }

    const request = await Request.findById(requestId);
    const Donor = require('../models/Donor');
    const donor = donorId ? await Donor.findById(donorId) : null;

    console.log('Health check debug:', {
      loggedInUser: req.user?._id?.toString(),
      userRole: req.user?.roles,
      requestId,
      donorId,
      request: request ? { id: request._id.toString(), status: request.status } : null,
      donor: donor ? { id: donor._id.toString(), bloodGroup: donor.bloodGroup, user: donor.user?.toString() } : null
    });

    if (!request) {
      return res.status(404).render('donor/health-check', {
        error: 'Blood request not found.',
        request: null,
        donor: null,
        token: null
      });
    }

    if (!donor) {
      return res.status(404).render('donor/health-check', {
        error: 'Donor profile not found.',
        request: null,
        donor: null,
        token: null
      });
    }

    const match = request.matchedDonors?.find(m => matchDonorId(m) === donorId);
    if (!match) {
      return res.status(404).render('donor/health-check', {
        error: 'You are not listed as a matched donor for this request.',
        request: null,
        donor: null,
        token: null
      });
    }

    if (match.healthStatus === 'cooldown') {
      return res.render('donor/health-check', {
        error: 'You recently donated and are on the 90-day cooldown. You cannot accept new requests until the cooldown ends.',
        request: null,
        donor: null,
        token: null
      });
    }

    if (request.acceptedDonor && acceptedDonorId(request) !== donorId) {
      return res.render('donor/health-check', {
        error: null,
        alreadyAssigned: true,
        request,
        donor,
        token,
        match
      });
    }

    if (['scheduled', 'verified', 'healthy'].includes(match.healthStatus)) {
      return res.render('donor/health-check', {
        error: null,
        alreadyConfirmed: true,
        awaitingDoctor: match.healthStatus === 'scheduled',
        adminVerified: match.healthStatus === 'verified' || match.healthStatus === 'healthy',
        request,
        donor,
        token,
        match,
        visitTime: match.scheduledVisitAt || request.scheduledVisitAt
      });
    }

    res.render('donor/health-check', {
      error: null,
      alreadyAssigned: false,
      alreadyConfirmed: false,
      request,
      donor,
      token,
      match
    });
  } catch (err) {
    console.error('getHealthCheck error:', err.message);
    res.status(500).send('Something went wrong.');
  }
};

exports.postHealthCheck = async (req, res) => {
  try {
    const { requestId, donorId } = req.params;
    const token = normalizeToken(req.body.token);
    const { healthy } = req.body;

    if (!verifyHealthCheckToken(requestId, donorId, token)) {
      return res.status(403).render('donor/health-check', {
        error: 'Invalid or expired link.',
        request: null,
        donor: null,
        token: null
      });
    }

    const request = await Request.findById(requestId);
    const Donor = require('../models/Donor');
    const donor = donorId ? await Donor.findById(donorId) : null;
    const { sendDonorScreeningVisitMail } = require('../services/emailService');

    console.log('Health check post debug:', {
      loggedInUser: req.user?._id?.toString(),
      userRole: req.user?.roles,
      requestId,
      donorId,
      request: request ? { id: request._id.toString(), status: request.status } : null,
      donor: donor ? { id: donor._id.toString(), bloodGroup: donor.bloodGroup, user: donor.user?.toString() } : null
    });

    if (!request) {
      return res.status(404).render('donor/health-check', {
        error: 'Blood request not found.',
        request: null,
        donor: null,
        token: null
      });
    }

    if (!donor) {
      return res.status(404).render('donor/health-check', {
        error: 'Donor profile not found.',
        request: null,
        donor: null,
        token: null
      });
    }

    const matchedDonors = request.matchedDonors || [];
    const matchIndex = matchedDonors.findIndex(m => matchDonorId(m) === donorId);
    if (matchIndex === -1) {
      return res.status(404).render('donor/health-check', {
        error: 'Match not found on this request. Open the link from your latest email.',
        request: null,
        donor: null,
        token: null
      });
    }

    const currentMatch = matchedDonors[matchIndex];
    if (['scheduled', 'verified', 'healthy'].includes(currentMatch.healthStatus)) {
      return res.render('donor/health-check', {
        error: null,
        screeningScheduled: currentMatch.healthStatus === 'scheduled',
        adminVerified: ['verified', 'healthy'].includes(currentMatch.healthStatus),
        awaitingDoctor: currentMatch.healthStatus === 'scheduled',
        request,
        donor,
        visitTime: currentMatch.scheduledVisitAt || request.scheduledVisitAt,
        match: currentMatch
      });
    }

    const willAttend = healthy === 'yes';
    const willReschedule = healthy === 'reschedule';
    const now = new Date();

    if (!willAttend && !willReschedule) {
      // Donor declined completely
      const rescheduleResult = await handleDonorUnavailable(requestId, donorId, 'Donor declined to participate');
      
      matchedDonors[matchIndex].healthStatus = 'unfit';
      matchedDonors[matchIndex].healthCheckedAt = now;
      matchedDonors[matchIndex].respondedAt = now;
      matchedDonors[matchIndex].responseStatus = 'declined';
      request.matchedDonors = matchedDonors;
      if (acceptedDonorId(request) === donorId) {
        request.acceptedDonor = undefined;
        request.awaitingAdminVerification = false;
        request.scheduledVisitAt = undefined;
        request.status = 'matched';
      }
      request.markModified('matchedDonors');
      await request.save();

      return res.render('donor/health-check', {
        error: null,
        declined: true,
        request,
        donor,
        token: null,
        match: matchedDonors[matchIndex]
      });
    }

    if (willReschedule) {
      // Donor requested different time
      const reason = 'Not available at scheduled time';
      const rescheduleResult = await handleDonorUnavailable(requestId, donorId, reason);
      
      return res.render('donor/health-check', {
        error: null,
        rescheduled: true,
        rescheduleMessage: rescheduleResult.message,
        request,
        donor,
        token: null,
        match: matchedDonors[matchIndex]
      });
    }

    if (request.acceptedDonor && acceptedDonorId(request) !== donorId) {
      return res.render('donor/health-check', {
        error: null,
        alreadyAssigned: true,
        request,
        donor,
        token: null,
        match: matchedDonors[matchIndex]
      });
    }

    const visitTime = getSuggestedVisitTime(request.emergencyLevel);
    matchedDonors[matchIndex].healthStatus = 'scheduled';
    matchedDonors[matchIndex].healthCheckedAt = now;
    matchedDonors[matchIndex].respondedAt = now;
    matchedDonors[matchIndex].responseStatus = 'accepted';
    matchedDonors[matchIndex].scheduledVisitAt = visitTime;

    request.matchedDonors = matchedDonors;
    request.acceptedDonor = donor._id;
    request.scheduledVisitAt = visitTime;
    request.awaitingAdminVerification = true;
    request.status = 'accepted';
    request.markModified('matchedDonors');
    await request.save();

    try {
      await sendDonorScreeningVisitMail(donor, request, visitTime);
    } catch (mailErr) {
      console.error('Screening visit email error:', mailErr.message);
    }

    try {
      await createRequesterNotification({
        request,
        title: 'Donor scheduled for screening',
        message: `${donor.name} will visit ${request.hospitalName} for doctor examination. You will be notified after admin verification.`,
        type: 'request-match'
      });
    } catch (notifErr) {
      console.error('Notification error:', notifErr.message);
    }

    return res.render('donor/health-check', {
      error: null,
      screeningScheduled: true,
      request,
      donor,
      visitTime,
      match: matchedDonors[matchIndex]
    });
  } catch (err) {
    console.error('postHealthCheck error:', err.message, err.stack);
    res.status(500).render('donor/health-check', {
      error: 'Something went wrong. Please try again or contact support.',
      request: null,
      donor: null,
      token: null
    });
  }
};
