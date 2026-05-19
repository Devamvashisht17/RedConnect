const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/requestController');

router.get('/request',        ctrl.getRequest);
router.post('/request-blood', ctrl.postRequest);

module.exports = router;
