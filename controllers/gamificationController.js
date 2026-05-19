// controllers/gamificationController.js
const DonorStats = require('../models/DonorStats');
const Donation   = require('../models/Donation');
const { getLeaderboard, isInCooldown, getNextLevelInfo } = require('../services/gamificationService');

exports.dashboard = async (req, res) => {
  try {
    let stats = await DonorStats.findOne({ user: req.user._id });
    if (!stats) stats = await DonorStats.create({ user: req.user._id });
    const [donations, leaderboard] = await Promise.all([
      Donation.find({ donor: req.user._id }).sort({ donatedAt: -1 }).limit(5),
      getLeaderboard(10)
    ]);
    const rank          = await DonorStats.countDocuments({ totalPoints: { $gt: stats.totalPoints } }) + 1;
    const cooldown      = await isInCooldown(req.user._id);
    const nextLevelInfo = getNextLevelInfo(stats);
    res.render('donor/dashboard', { user: req.user, stats, donations, leaderboard, rank, cooldown, nextLevelInfo });
  } catch (err) {
    console.error('Donor dashboard error:', err.message);
    res.status(500).send('Something went wrong.');
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
