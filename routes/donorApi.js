const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/gamificationController');
const { protect, requireDonor } = require('../middleware/authMiddleware');

router.patch('/profile', protect, ctrl.patchProfile);

module.exports = router;
