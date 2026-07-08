const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

async function getUser(req) {
  const token = req.cookies?.token;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return await User.findById(decoded.id).select('-password');
  } catch { return null; }
}

router.get('/dashboard-select', async (req, res) => {
  const user = await getUser(req);
  if (!user) return res.redirect('/login');
  res.render('dashboard-select', { user });
});

module.exports = router;