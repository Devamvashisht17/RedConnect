const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/paymentController');

router.post('/create-order',   ctrl.createOrder);
router.post('/verify-payment', ctrl.verifyPayment);

module.exports = router;
