const Donor         = require('../models/Donor');
const Donation      = require('../models/Donation');
const DonorStats    = require('../models/DonorStats');
const { bloodData } = require('./homeController');

const COOLDOWN_DAYS = 90;

async function checkCooldown(userId) {
  if (!userId) return null;
  // check DonorStats cooldownUntil (set after admin verifies)
  const stats = await DonorStats.findOne({ user: userId });
  if (stats?.cooldownUntil && new Date() < stats.cooldownUntil)
    return stats.cooldownUntil;
  // also check if a pending donation exists within 90 days
  const recent = await Donation.findOne({
    donor: userId,
    donatedAt: { $gte: new Date(Date.now() - COOLDOWN_DAYS * 24 * 60 * 60 * 1000) }
  }).sort({ donatedAt: -1 });
  if (recent) {
    const until = new Date(recent.donatedAt.getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
    return until;
  }
  return null;
}

exports.getRegister = async (req, res) => {
  if (res.locals.user) {
    const cooldownUntil = await checkCooldown(res.locals.user._id);
    if (cooldownUntil) return res.render('register', { cooldownUntil });
  }
  res.render('register', { cooldownUntil: null });
};

exports.postRegister = async (req, res) => {
  try {
    // cooldown check for logged-in users
    if (res.locals.user) {
      const cooldownUntil = await checkCooldown(res.locals.user._id);
      if (cooldownUntil) return res.render('register', { cooldownUntil });
    }

    const { name, email, phone, dob, bloodGroup, city } = req.body;
    const existing = await Donor.findOne({ email });
    if (existing) {
      await Donor.findOneAndUpdate({ email }, { name, phone, dob, bloodGroup, city });
    } else {
      await Donor.create({ name, email, phone, dob, bloodGroup, city });
    }

    if (res.locals.user) {
      await Donation.create({
        donor:       res.locals.user._id,
        bloodGroup,  hospital: city, city,
        isEmergency: false,
        isRareBlood: ['AB-','B-','A-','O-'].includes(bloodGroup),
        status: 'pending'
      });
      return res.redirect('/donor/dashboard');
    }

    res.redirect('/thankyou?name=' + encodeURIComponent(name));
  } catch (err) {
    console.error('Register error:', err.message);
    res.redirect('/register');
  }
};

exports.getDonorsByGroup = async (req, res) => {
  const group      = decodeURIComponent(req.params.group);
  const groupDonors = await Donor.find({ bloodGroup: group });
  res.render('donors-group', { group, groupDonors, compat: bloodData[group] || null });
};
