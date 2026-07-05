const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/requesterController');
const { protect, requireRequester } = require('../middleware/authMiddleware');

router.get('/dashboard', protect, requireRequester, ctrl.dashboard);
router.post('/create-request', protect, requireRequester, ctrl.createRequest);
router.post('/toggle-role', protect, requireRequester, ctrl.toggleRole);

module.exports = router;
