// routes/hospital.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/hospitalController');
const { isHospital } = require('../middleware/hospitalMiddleware');

router.get('/login',      ctrl.showLogin);
router.post('/login',     ctrl.login);
router.get('/register',   ctrl.showRegister);
router.post('/register',  ctrl.register);
router.get('/dashboard',  isHospital, ctrl.dashboard);
router.post('/emergency', isHospital, ctrl.createEmergencyRequest);
router.post('/inventory', isHospital, ctrl.updateInventory);
router.post('/fulfill/:requestId', isHospital, ctrl.fulfillRequest);
router.get('/logout',     ctrl.logout);

module.exports = router;
