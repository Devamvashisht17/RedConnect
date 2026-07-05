const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/homeController');

router.get('/',            ctrl.index);
router.get('/blood',       ctrl.blood);
router.get('/how-it-works',ctrl.howItWorks);
router.get('/thankyou',    ctrl.thankyou);
router.get('/dashboard',   ctrl.dashboard);
router.post('/feedback',   ctrl.submitFeedback);

module.exports = router;
