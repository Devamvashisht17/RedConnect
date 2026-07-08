// routes/admin.js
const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/adminController');
const sc       = require('../controllers/screeningController');
const { isAdmin } = require('../middleware/adminMiddleware');

router.get('/dashboard',                 isAdmin, ctrl.dashboard);
router.get('/donations',                 isAdmin, ctrl.donationsList);
router.get('/payments',                  isAdmin, ctrl.paymentsList);
router.post('/verify-donation/:id',      isAdmin, ctrl.verifyDonation);
router.post('/reject-donation/:id',      isAdmin, ctrl.rejectDonation);
router.get('/hospitals',                 isAdmin, ctrl.hospitals);
router.post('/reply-feedback/:id',        isAdmin, ctrl.replyFeedback);
router.post('/verify-request-donor/:requestId/:donorId', isAdmin, ctrl.verifyRequestDonor);
router.post('/reject-request-donor/:requestId/:donorId',  isAdmin, ctrl.rejectRequestDonor);
router.post('/verify-hospital/:id',      isAdmin, ctrl.verifyHospital);

// Doctor Screening
router.get('/screening',           isAdmin, sc.screeningDashboard);
router.get('/screening/:id',       isAdmin, sc.getDetails);
router.post('/screening/:id/fit',  isAdmin, sc.markFit);
router.post('/screening/:id/unfit',isAdmin, sc.markUnfit);

module.exports = router;
