const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/requestController');

router.get('/request',                              ctrl.getRequest);
router.post('/request-blood',                       ctrl.postRequest);
router.get('/request/:id/matches',                  ctrl.getMatches);
router.get('/request/:requestId/health/:donorId',   ctrl.getHealthCheck);
router.post('/request/:requestId/health/:donorId',  ctrl.postHealthCheck);

module.exports = router;
