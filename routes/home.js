const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/homeController');
const { protect } = require('../middleware/authMiddleware');

router.get('/',            ctrl.index);
router.get('/blood',       ctrl.blood);
router.get('/how-it-works',ctrl.howItWorks);
router.get('/thankyou',    ctrl.thankyou);
router.get('/dashboard',        protect, ctrl.dashboard);
router.get('/dashboard-select', protect, ctrl.dashboard);
router.get('/feedback',    ctrl.feedbackPage);
router.post('/feedback',   ctrl.submitFeedback);

module.exports = router;
