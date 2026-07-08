const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/requesterController');
const { protect, requireRequester, hasRole } = require('../middleware/authMiddleware');
const User = require('../models/User');

router.get('/dashboard', protect, (req, res, next) => {
  if (!hasRole(req.user, 'requester')) {
    return res.redirect('/dashboard-select');
  }
  next();
}, ctrl.dashboard);

router.post('/enable-role', protect, async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { $addToSet: { roles: 'requester' } });
  res.redirect('/requester/dashboard');
});

router.post('/create-request', protect, requireRequester, ctrl.createRequest);
router.post('/toggle-role', protect, requireRequester, ctrl.toggleRole);


module.exports = router;
