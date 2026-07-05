const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/requesterController');
const { protect, requireRequester } = require('../middleware/authMiddleware');

router.get('/dashboard', protect, requireRequester, ctrl.dashboard);
router.post('/create-request', protect, requireRequester, ctrl.createRequest);
// Any logged-in user may enable the requester role for themselves.
// This must NOT be guarded by requireRequester, otherwise a donor-only
// user could never gain the requester role (chicken-and-egg).
router.post('/toggle-role', protect, ctrl.toggleRole);

module.exports = router;
