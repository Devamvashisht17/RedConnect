const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/volunteerController');

router.get('/volunteer',  ctrl.getVolunteer);
router.post('/volunteer', ctrl.postVolunteer);

module.exports = router;
