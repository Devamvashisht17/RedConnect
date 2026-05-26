// routes/admin.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/adminController');
const { isAdmin } = require('../middleware/adminMiddleware');

router.get('/dashboard',                 isAdmin, ctrl.dashboard);
router.get('/hospitals',                 isAdmin, ctrl.hospitals);
router.post('/verify-donation/:id',      isAdmin, ctrl.verifyDonation);
router.post('/reject-donation/:id',      isAdmin, ctrl.rejectDonation);
router.post('/verify-request-donor/:requestId', isAdmin, ctrl.verifyRequestDonor);
router.post('/reject-request-donor/:requestId', isAdmin, ctrl.rejectRequestDonor);
router.post('/verify-hospital/:id',      isAdmin, ctrl.verifyHospital);

module.exports = router;
