const jwt  = require('jsonwebtoken');
const User = require('../models/User');
const Donor = require('../models/Donor');
const Hospital = require('../models/Hospital');

async function getLiveStats() {
  const [donors, hospitals] = await Promise.all([
    Donor.countDocuments({}),
    Hospital.countDocuments({ isVerified: true })
  ]);
  return { donors, donations: 0, hospitals };
}

const BLOOD_GROUP_OPTIONS = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];

const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim());
const isAdminEmail = (email) => ADMIN_EMAILS.includes(String(email || '').trim());

const cookieOpts = { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 };

async function getPostLoginRedirect(user) {
  const roles = user.roles || [];

  if (roles.includes('donor')) {
    // Verify they actually have a donor record with a valid blood group
    const donor = await Donor.findOne({ user: user._id }).select('bloodGroup');
    const valid = BLOOD_GROUP_OPTIONS.includes(String(donor?.bloodGroup || '').trim());
    if (valid) return '/donor/dashboard';
    // Has donor role but no valid blood group — strip the stale role
    await User.findByIdAndUpdate(user._id, { $pull: { roles: 'donor' } });
  }

  if (roles.includes('requester')) return '/requester/dashboard';

  return '/dashboard-select';
}

exports.getSignup = async (req, res) => {
  const stats = await getLiveStats();
  res.render('signup', { error: req.flash('error')[0] || null, stats });
};

exports.postSignup = async (req, res) => {
  const { name, email, password, confirmPassword } = req.body;
  if (password !== confirmPassword) {
    req.flash('error', 'Passwords do not match');
    return res.redirect('/signup');
  }
  try {
    if (await User.findOne({ email })) {
      req.flash('error', 'User already registered. Please login.');
      return res.redirect('/signup');
    }
    const profilePic = req.file ? '/uploads/' + req.file.filename : '';
    const user = await User.create({ name, email, password, profilePic });
    res.render('success', { name });
  } catch (err) {
    req.flash('error', err.message || 'Something went wrong.');
    res.redirect('/signup');
  }
};

exports.getLogin = async (req, res) => {
  const stats = await getLiveStats();
  res.render('login', { error: req.flash('error')[0] || null, stats });
};

exports.postLogin = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user)                              { req.flash('error', 'Not registered. Please signup.'); return res.redirect('/login'); }
    if (!user.password)                     { req.flash('error', 'Please login with Google.');      return res.redirect('/login'); }
    if (!await user.matchPassword(password)){ req.flash('error', 'Incorrect password.');            return res.redirect('/login'); }
    res.cookie('token', generateToken(user._id), cookieOpts);
    if (isAdminEmail(user.email)) return res.redirect('/admin/dashboard');
    res.redirect(await getPostLoginRedirect(user));
  } catch (err) {
    req.flash('error', 'Something went wrong.');
    res.redirect('/login');
  }
};

exports.logout = (req, res) => {
  res.clearCookie('token');
  req.session.destroy(() => {
    res.redirect('/');
  });
};

exports.googleCallback = async (req, res) => {
  res.cookie('token', generateToken(req.user._id), cookieOpts);
  if (isAdminEmail(req.user?.email)) return res.redirect('/admin/dashboard');
  res.redirect(await getPostLoginRedirect(req.user));
};
