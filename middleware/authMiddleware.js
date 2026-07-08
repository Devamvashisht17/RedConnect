// middleware/authMiddleware.js
const jwt  = require('jsonwebtoken');
const User = require('../models/User');
const Donor = require('../models/Donor');

const BLOOD_GROUP_OPTIONS = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];

function hasRole(user, role) {
  const roles = user?.roles || [];
  return roles.includes(role);
}

function redirectToOwnDashboard(req, res) {
  const user = req.user;
  if (!user) return res.redirect('/login');

  if (hasRole(user, 'donor')) return res.redirect('/donor/dashboard');
  if (hasRole(user, 'requester')) return res.redirect('/requester/dashboard');
  return res.redirect('/dashboard-select');
}

const protect = async (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) return res.redirect('/login');
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user      = await User.findById(decoded.id).select('-password');
    if (!req.user) return res.redirect('/login');

    next();
  } catch (err) {
    res.clearCookie('token');
    res.redirect('/login');
  }
};

const requireDonor = (req, res, next) => {
  if (!req.user) return res.redirect('/login');
  if (!hasRole(req.user, 'donor')) return res.redirect('/register');
  next();
};

const requireRequester = (req, res, next) => {
  if (!req.user) return res.redirect('/login');
  if (!hasRole(req.user, 'requester')) {
    return redirectToOwnDashboard(req, res);
  }
  next();
};

const requireDonorBloodGroup = async (req, res, next) => {
  if (!req.user) return res.redirect('/login');
  if (!hasRole(req.user, 'donor')) {
    return redirectToOwnDashboard(req, res);
  }

  const donor = await Donor.findOne({ user: req.user._id }).select('bloodGroup');
  const isValid = BLOOD_GROUP_OPTIONS.includes(String(donor?.bloodGroup || '').trim());
  if (isValid) return next();

  if (req.path.startsWith('/api/')) {
    return res.status(403).json({
      success: false,
      error: 'Complete your donor profile to continue.',
      redirectUrl: '/donor/complete-profile'
    });
  }

  return res.redirect('/donor/complete-profile');
};

module.exports = {
  protect,
  requireDonor,
  requireRequester,
  requireDonorBloodGroup,
  redirectToOwnDashboard,
  hasRole,
  BLOOD_GROUP_OPTIONS
};
