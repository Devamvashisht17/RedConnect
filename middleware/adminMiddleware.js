// middleware/adminMiddleware.js
const jwt      = require('jsonwebtoken');
const mongoose = require('mongoose');

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim());

const isAdmin = async (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) return res.redirect('/login');
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const User    = mongoose.model('User');
    const user    = await User.findById(decoded.id).select('-password');
    if (!user || !ADMIN_EMAILS.includes(user.email)) return res.status(403).render('404');
    req.user = user;
    next();
  } catch (err) {
    res.clearCookie('token');
    res.redirect('/login');
  }
};

module.exports = { isAdmin };
