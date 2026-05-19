// routes/donor.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/gamificationController');
const { protect } = require('../middleware/authMiddleware');

router.get('/dashboard',        protect, ctrl.dashboard);
router.get('/leaderboard',      protect, ctrl.leaderboard);
router.post('/log-donation',    protect, ctrl.logDonation);
router.post('/update-location', protect, ctrl.updateLocation);

module.exports = router;
