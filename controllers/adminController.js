// controllers/adminController.js
const Request    = require('../models/Request');
require('../models/Donor');
const Hospital   = require('../models/Hospital');
const mongoose   = require('mongoose');
const { sendAdminVerifiedMails, sendFeedbackReplyMail } = require('../services/emailService');
const { createRequesterNotification, getSuggestedDonationTime } = require('../services/requestMatchingService');
const { refId } = require('../utils/refId');
const Feedback    = require('../models/Feedback');
const Volunteer   = require('../models/Volunteer');
const Certificate = require('../models/Certificate');
const Donation    = require('../models/Donation');
const Payment     = require('../models/Payment');
const { createCertificate } = require('./certificateController');

function makeCertificateId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `RC-${date}-${rand}`;
}

exports.dashboard = async (req, res) => {
  try {
    const User  = mongoose.model('User');
    const Donor = mongoose.model('Donor');

    const [totalDonors, openRequests, pendingHospitals, totalUsers, lowRatingFeedback, volunteers, certificates, totalPayments, amountAgg] = await Promise.all([
      Donor.countDocuments(),
      Request.countDocuments({ status: { $in: ['pending', 'matched', 'accepted'] } }),
      Hospital.find({ isVerified: false }).limit(5),
      User.countDocuments(),
      Feedback.find({ rating: { $lt: 3 } }).sort({ createdAt: -1 }).limit(20).lean(),
      Volunteer.find().sort({ registeredAt: -1 }).limit(20).lean(),
      Certificate.find().sort({ issuedAt: -1 }).limit(50).lean(),
      Payment.countDocuments().catch(() => 0),
      Payment.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]).catch(() => [])
    ]);

    const totalAmountRaised = amountAgg[0]?.total || 0;

    res.render('admin/dashboard', {
      user: req.user,
      totalDonors,
      openRequests,
      pendingHospitals,
      totalUsers,
      volunteerCount: volunteers.length,
      volunteers,
      lowRatingFeedback,
      certificates,
      totalPayments,
      totalAmountRaised
    });
  } catch (err) {
    console.error('Admin dashboard error:', err.message);
    res.status(500).send('Something went wrong.');
  }
};

exports.replyFeedback = async (req, res) => {
  try {
    const feedback = await Feedback.findById(req.params.id).lean();
    if (!feedback) return res.status(404).json({ error: 'Feedback not found.' });
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Reply message is required.' });
    await sendFeedbackReplyMail(feedback, message.trim());
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.verifyRequestDonor = async (req, res) => {
  try {
    const { requestId, donorId } = req.params;
    const Donor = mongoose.model('Donor');

    const request = await Request.findById(requestId);
    if (!request) return res.status(404).json({ error: 'Blood request not found.' });

    const donor = await Donor.findById(donorId).populate('user', 'email name');
    if (!donor) return res.status(404).json({ error: 'Donor not found.' });

    const matchIndex = (request.matchedDonors || []).findIndex(
      m => refId(m.donor) === donorId
    );
    if (matchIndex === -1) return res.status(400).json({ error: 'Donor match not found on request.' });

    if (!donor.email && donor.user?.email) donor.email = donor.user.email;

    const donationTime = getSuggestedDonationTime(new Date());
    request.matchedDonors[matchIndex].healthStatus    = 'verified';
    request.matchedDonors[matchIndex].scheduledVisitAt = donationTime;
    request.acceptedDonor             = donor._id;
    request.awaitingAdminVerification = false;
    request.status                    = 'completed';
    request.handledBy                 = req.user._id;
    request.completedAt               = new Date();
    request.scheduledVisitAt          = donationTime;
    request.markModified('matchedDonors');
    await request.save();

    try {
      await sendAdminVerifiedMails(donor, request, donationTime);
    } catch (mailErr) {
      console.error('Admin verified email error:', mailErr.message);
    }

    try {
      const cert = await createCertificate({ donor, user: donor.user || null, request });
      await Donation.findOneAndUpdate(
        { donor: donor._id, status: 'pending' },
        { status: 'verified', certificateId: cert.certificateId, certificate: cert._id, verifiedBy: req.user._id, verifiedAt: new Date() }
      );
    } catch (certErr) {
      console.error('Certificate generation error:', certErr.message);
    }

    await createRequesterNotification({
      request,
      title:   'Donor cleared — arrange blood collection',
      message: `${donor.name} is verified healthy. Please arrange to receive blood at ${request.hospitalName} on ${donationTime.toLocaleString()}.`,
      type:    'request-completed'
    });

    res.json({ success: true, message: `Donor verified. Emails sent to ${donor.email} and ${request.requesterEmail || 'requester'}.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.rejectRequestDonor = async (req, res) => {
  try {
    const { requestId, donorId } = req.params;

    const request = await Request.findById(requestId);
    if (!request) return res.status(404).json({ error: 'Blood request not found.' });

    const matchIndex = (request.matchedDonors || []).findIndex(
      m => refId(m.donor) === donorId
    );
    if (matchIndex === -1) return res.status(400).json({ error: 'Donor match not found on request.' });

    request.matchedDonors[matchIndex].healthStatus   = 'unfit';
    request.matchedDonors[matchIndex].responseStatus = 'declined';
    request.markModified('matchedDonors');

    if (refId(request.acceptedDonor) === donorId) {
      request.acceptedDonor             = undefined;
      request.awaitingAdminVerification = false;
      request.status                    = 'matched';
    }

    await request.save();

    await createRequesterNotification({
      request,
      title:   'Donor not cleared',
      message: 'A donor did not pass screening. Searching for other donors.',
      type:    'request-declined'
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

exports.donationsList = async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = 20;

    const [pending, verified, rejected, total, donations] = await Promise.all([
      Donation.countDocuments({ status: 'pending' }),
      Donation.countDocuments({ status: 'verified' }),
      Donation.countDocuments({ status: 'rejected' }),
      Donation.countDocuments({ status }),
      Donation.find({ status }).sort({ donatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean()
    ]);

    res.render('admin/donations', {
      user: req.user,
      donations,
      stats:         { pending, verified, rejected },
      currentStatus: status,
      currentPage:   page,
      totalPages:    Math.max(1, Math.ceil(total / limit))
    });
  } catch (err) {
    console.error('Admin donations list error:', err.message);
    res.status(500).send('Something went wrong.');
  }
};

exports.verifyDonation = async (req, res) => {
  try {
    const donation = await Donation.findById(req.params.id).populate('donor');
    if (!donation) return res.status(404).json({ error: 'Donation not found.' });
    if (donation.status !== 'pending') return res.status(400).json({ error: 'Donation already processed.' });

    const certificateId = makeCertificateId();
    const cert = await Certificate.create({
      certificateId,
      donor:      donation.donor._id,
      user:       donation.user || undefined,
      donorName:  donation.donorName,
      bloodGroup: donation.bloodGroup,
      hospital:   donation.hospital,
      city:       donation.city,
      donatedAt:  donation.donatedAt
    });

    donation.status        = 'verified';
    donation.certificateId = certificateId;
    donation.certificate   = cert._id;
    donation.verifiedBy    = req.user._id;
    donation.verifiedAt    = new Date();
    await donation.save();

    res.json({ success: true, certificateId });
  } catch (err) {
    console.error('Verify donation error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.rejectDonation = async (req, res) => {
  try {
    const donation = await Donation.findById(req.params.id);
    if (!donation) return res.status(404).json({ error: 'Donation not found.' });
    donation.status     = 'rejected';
    donation.rejectedAt = new Date();
    await donation.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.paymentsList = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;

    const [payments, total, amountAgg] = await Promise.all([
      Payment.find().sort({ paidAt: -1 }).skip((page - 1) * limit).limit(limit).populate('user', 'name email').lean(),
      Payment.countDocuments().catch(() => 0),
      Payment.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]).catch(() => [])
    ]);

    res.render('admin/payments', {
      user:          req.user,
      payments,
      totalPayments: total,
      totalAmount:   amountAgg[0]?.total || 0,
      currentPage:   page,
      totalPages:    Math.max(1, Math.ceil(total / limit))
    });
  } catch (err) {
    console.error('Payments list error:', err.message);
    res.status(500).send('Something went wrong.');
  }
};
