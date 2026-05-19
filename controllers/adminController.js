// controllers/adminController.js
const Donation   = require('../models/Donation');
const DonorStats = require('../models/DonorStats');
const Queue      = require('../models/Queue');
const Hospital   = require('../models/Hospital');
const mongoose   = require('mongoose');
const { awardDonation }                          = require('../services/gamificationService');
const { getQueueSnapshot, recalculatePositions } = require('../services/queueService');

exports.dashboard = async (req, res) => {
  try {
    const BloodRequest = mongoose.model('BloodRequest');
    const User         = mongoose.model('User');
    const [pendingDonations, queueSnapshot, totalDonors, activeRequests, pendingHospitals, totalUsers] = await Promise.all([
      Donation.find({ status: 'pending' }).populate('donor', 'name email').sort({ createdAt: -1 }).limit(10),
      getQueueSnapshot(),
      DonorStats.countDocuments({ verifiedDonations: { $gt: 0 } }),
      Queue.countDocuments({ status: 'waiting' }),
      Hospital.find({ isVerified: false }).limit(5),
      User.countDocuments()
    ]);
    res.render('admin/dashboard', { user: req.user, pendingDonations, queueSnapshot, totalDonors, activeRequests, pendingHospitals, totalUsers });
  } catch (err) {
    console.error('Admin dashboard error:', err.message);
    res.status(500).send('Something went wrong.');
  }
};

exports.verifyDonation = async (req, res) => {
  try {
    const donation = await Donation.findById(req.params.id);
    if (!donation) return res.status(404).json({ error: 'Not found' });
    donation.status = 'verified'; donation.verifiedBy = req.user._id;
    await donation.save();
    const { stats, pointsEarned } = await awardDonation(donation.donor, donation);
    // Socket.IO alert to donor
    const emitters = req.app.get('socketEmitters');
    if (emitters) emitters.notifyDonor(donation.donor.toString(), {
      type: 'achievement', message: `✅ Donation verified! +${pointsEarned} points. Level: ${stats.donorLevel}`
    });
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

exports.verifyHospital = async (req, res) => {
  try {
    await Hospital.findByIdAndUpdate(req.params.id, { isVerified: true, verifiedBy: req.user._id, verifiedAt: new Date() });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.markCritical = async (req, res) => {
  try {
    const entry = await Queue.findOne({ request: req.params.requestId });
    if (!entry) return res.status(404).json({ error: 'Not found' });
    const old = entry.queueLevel;
    entry.queueLevel = 'critical'; entry.priorityScore += 1000;
    await entry.save();
    await recalculatePositions(old);
    await recalculatePositions('critical');
    const emitters = req.app.get('socketEmitters');
    if (emitters) emitters.broadcastQueueUpdate();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.fulfillRequest = async (req, res) => {
  try {
    const BloodRequest = mongoose.model('BloodRequest');
    const entry = await Queue.findOne({ request: req.params.requestId });
    if (!entry) return res.status(404).json({ error: 'Not found in queue' });
    const level = entry.queueLevel;
    entry.status = 'fulfilled'; entry.fulfilledAt = new Date();
    await entry.save();
    await BloodRequest.findByIdAndUpdate(req.params.requestId, { status: 'Fulfilled' });
    await recalculatePositions(level);
    const emitters = req.app.get('socketEmitters');
    if (emitters) emitters.broadcastQueueUpdate();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.queueMonitor = async (req, res) => {
  try {
    const snapshot  = await getQueueSnapshot();
    const fulfilled = await Queue.find({ status: 'fulfilled' })
      .sort({ fulfilledAt: -1 }).limit(20)
      .populate({ path: 'request', select: 'patientName bloodGroup emergencyLevel city hospitalName' });
    res.render('admin/queue', { user: req.user, snapshot, fulfilled });
  } catch (err) {
    res.render('admin/queue', { user: req.user, snapshot: { critical: [], emergency: [], priority: [], normal: [] }, fulfilled: [] });
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
