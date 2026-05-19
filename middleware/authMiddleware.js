// middleware/authMiddleware.js
const jwt  = require('jsonwebtoken');
const User = require('../models/User');

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

module.exports = { protect };
