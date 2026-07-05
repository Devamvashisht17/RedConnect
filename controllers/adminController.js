// controllers/adminController.js
const Donation   = require('../models/Donation');
const Request    = require('../models/Request');
require('../models/Donor');
const DonorStats = require('../models/DonorStats');
const Hospital   = require('../models/Hospital');
const mongoose   = require('mongoose');
const { awardDonation } = require('../services/gamificationService');
const { sendAdminVerifiedMails } = require('../services/emailService');
const { createRequesterNotification, getSuggestedDonationTime } = require('../services/requestMatchingService');
const { refId } = require('../utils/refId');
const Feedback = require('../models/Feedback');

function assignNextScreeningDonor(request) {
  const next = (request.matchedDonors || []).find(
    m => m.healthStatus === 'scheduled' && m.responseStatus !== 'declined'
  );
  if (next) {
    request.acceptedDonor = next.donor;
    request.scheduledVisitAt = next.scheduledVisitAt || request.scheduledVisitAt;
    request.awaitingAdminVerification = true;
    request.status = 'accepted';
  } else {
    request.acceptedDonor = undefined;
    request.awaitingAdminVerification = false;
    request.scheduledVisitAt = undefined;
    request.status = 'matched';
  }
}

exports.dashboard = async (req, res) => {
  try {
    const User = mongoose.model('User');
    const [pendingDonations, totalDonors, openRequests, pendingHospitals, totalUsers, pendingScreening, feedbackCount] = await Promise.all([
      Donation.find({ status: 'pending' }).populate('donor', 'name email').sort({ createdAt: -1 }).limit(10),
      DonorStats.countDocuments({ verifiedDonations: { $gt: 0 } }),
      Request.countDocuments({ status: { $in: ['pending', 'matched', 'accepted'] } }),
      Hospital.find({ isVerified: false }).limit(5),
      User.countDocuments(),
      Request.find({ awaitingAdminVerification: true })
        .populate('acceptedDonor', 'name email phone bloodGroup city')
        .sort({ updatedAt: -1 })
        .limit(15),
      Feedback.countDocuments({})
    ]);
    res.render('admin/dashboard', {
      user: req.user,
      pendingDonations,
      totalDonors,
      openRequests,
      pendingHospitals,
      totalUsers,
      pendingScreening,
      feedbackCount
    });
  } catch (err) {
    console.error('Admin dashboard error:', err.message);
    res.status(500).send('Something went wrong.');
  }
};

exports.verifyDonation = async (req, res) => {
  try {
    const donation = await Donation.findById(req.params.id);
    if (!donation) return res.status(404).json({ error: 'Not found' });
    donation.status = 'verified';
    donation.verifiedBy = req.user._id;
    await donation.save();
    const { stats, pointsEarned } = await awardDonation(donation.donor, donation);
    const emitters = req.app.get('socketEmitters');
    if (emitters) {
      emitters.notifyDonor(donation.donor.toString(), {
        type: 'achievement',
        message: `✅ Donation verified! +${pointsEarned} pts. Level: ${stats.donorLevel}`
      });
    }
    res.json({ success: true, pointsEarned, newLevel: stats.donorLevel });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.rejectDonation = async (req, res) => {
  try {
    await Donation.findByIdAndUpdate(req.params.id, { status: 'rejected' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.verifyRequestDonor = async (req, res) => {
  try {
    const request = await Request.findById(req.params.requestId).populate('acceptedDonor');
    if (!request) {
      console.error('Admin verify request donor: blood request not found.', { requestId: req.params.requestId });
      return res.status(404).json({ error: 'Blood request not found.' });
    }

    if (!request.acceptedDonor) {
      console.error('Admin verify request donor: donor profile not found.', { requestId: req.params.requestId });
      return res.status(404).json({ error: 'Donor profile not found.' });
    }

    const donorId = request.acceptedDonor._id.toString();
    const matchIndex = (request.matchedDonors || []).findIndex(m => refId(m.donor) === donorId);
    if (matchIndex === -1) {
      return res.status(400).json({ error: 'Donor match not found on request' });
    }

    const donationTime = getSuggestedDonationTime(request.scheduledVisitAt || new Date());
    request.matchedDonors[matchIndex].healthStatus = 'verified';
    request.matchedDonors[matchIndex].scheduledVisitAt = donationTime;
    request.awaitingAdminVerification = false;
    request.status = 'completed';
    request.handledBy = req.user._id;
    request.completedAt = new Date();
    request.scheduledVisitAt = donationTime;
    request.markModified('matchedDonors');
    await request.save();

    const donor = request.acceptedDonor;
    try {
      await sendAdminVerifiedMails(donor, request, donationTime);
    } catch (mailErr) {
      console.error('Admin verified email error:', mailErr.message);
    }

    await createRequesterNotification({
      request,
      title: 'Donor cleared — arrange blood collection',
      message: `${donor.name} is verified healthy. Please arrange to receive blood at ${request.hospitalName}.`,
      type: 'request-completed'
    });

    res.json({
      success: true,
      message: 'Donor verified. Donor and requester emailed with blood donation details.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.rejectRequestDonor = async (req, res) => {
  try {
    const request = await Request.findById(req.params.requestId).populate('acceptedDonor');
    if (!request) {
      console.error('Admin reject request donor: blood request not found.', { requestId: req.params.requestId });
      return res.status(404).json({ error: 'Blood request not found.' });
    }

    if (!request.acceptedDonor) {
      console.error('Admin reject request donor: donor profile not found.', { requestId: req.params.requestId });
      return res.status(404).json({ error: 'Donor profile not found.' });
    }

    const donorName = request.acceptedDonor.name;
    const donorId = request.acceptedDonor._id.toString();
    const matchIndex = (request.matchedDonors || []).findIndex(m => refId(m.donor) === donorId);
    if (matchIndex >= 0) {
      request.matchedDonors[matchIndex].healthStatus = 'unfit';
      request.matchedDonors[matchIndex].responseStatus = 'declined';
      request.markModified('matchedDonors');
    }

    assignNextScreeningDonor(request);
    await request.save();

    await createRequesterNotification({
      request,
      title: 'Donor not cleared',
      message: `${donorName} did not pass screening.${request.awaitingAdminVerification ? ' Another donor is awaiting verification.' : ' Searching for other donors.'}`,
      type: 'request-declined'
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.verifyHospital = async (req, res) => {
  try {
    await Hospital.findByIdAndUpdate(req.params.id, {
      isVerified: true,
      verifiedBy: req.user._id,
      verifiedAt: new Date()
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.hospitals = async (req, res) => {
  try {
    const hospitals = await Hospital.find().sort({ createdAt: -1 });
    res.render('admin/hospitals', { user: req.user, hospitals });
  } catch (err) {
    res.status(500).send('Something went wrong.');
  }
};
