// middleware/hospitalMiddleware.js
const jwt      = require('jsonwebtoken');
const Hospital = require('../models/Hospital');
const bcrypt   = require('bcryptjs');

const isHospital = async (req, res, next) => {
  const token = req.cookies?.hospitalToken;
  if (!token) return res.redirect('/hospital/login');
  try {
    const decoded  = jwt.verify(token, process.env.JWT_SECRET);
    const hospital = await Hospital.findById(decoded.id);
    if (!hospital || !hospital.isVerified) return res.redirect('/hospital/login');
    req.hospital = hospital;
    next();
  } catch (err) {
    res.clearCookie('hospitalToken');
    res.redirect('/hospital/login');
  }
};

module.exports = { isHospital };
