const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/donorController');

router.get('/register',       ctrl.getRegister);
router.post('/register',      ctrl.postRegister);
router.get('/donors/:group',  ctrl.getDonorsByGroup);

module.exports = router;
