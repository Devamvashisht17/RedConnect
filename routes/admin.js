// routes/admin.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/adminController');
const { isAdmin } = require('../middleware/adminMiddleware');

router.get('/dashboard',                 isAdmin, ctrl.dashboard);
router.get('/queue',                     isAdmin, ctrl.queueMonitor);
router.get('/hospitals',                 isAdmin, ctrl.hospitals);
router.post('/verify-donation/:id',      isAdmin, ctrl.verifyDonation);
router.post('/reject-donation/:id',      isAdmin, ctrl.rejectDonation);
router.post('/verify-hospital/:id',      isAdmin, ctrl.verifyHospital);
router.post('/mark-critical/:requestId', isAdmin, ctrl.markCritical);
router.post('/fulfill/:requestId',       isAdmin, ctrl.fulfillRequest);

module.exports = router;
