const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/requesterController');
const { protect, requireRequester } = require('../middleware/authMiddleware');

router.get('/dashboard', protect, requireRequester, ctrl.dashboard);
router.post('/create-request', protect, requireRequester, ctrl.createRequest);
// toggle-role only needs authentication — a donor uses it to ENABLE the requester role,
// so it must not require the requester role (that would be a deadlock).
router.post('/toggle-role', protect, ctrl.toggleRole);

module.exports = router;
