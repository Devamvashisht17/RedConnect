// routes/donor.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/gamificationController');
const { protect, requireDonor, requireDonorBloodGroup } = require('../middleware/authMiddleware');

router.use(protect, requireDonor);

router.get('/complete-profile', ctrl.getCompleteProfile);

router.get('/dashboard',        requireDonorBloodGroup, ctrl.dashboard);
router.get('/leaderboard',      requireDonorBloodGroup, ctrl.leaderboard);
router.get('/api/requests',     requireDonorBloodGroup, ctrl.getRequestsFeed);
router.get('/history',          requireDonorBloodGroup, ctrl.historyPage);
router.get('/notifications',    requireDonorBloodGroup, ctrl.notificationsPage);
router.post('/log-donation',    requireDonorBloodGroup, ctrl.logDonation);
router.post('/update-location', requireDonorBloodGroup, ctrl.updateLocation);
router.post('/availability',     requireDonorBloodGroup, ctrl.setAvailability);
router.get('/request/:id',      requireDonorBloodGroup, ctrl.requestDetails);
router.post('/request/:id/respond', requireDonorBloodGroup, ctrl.respondToRequest);

module.exports = router;
