const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/authController');
const upload   = require('../config/multer');
const passport = require('../auth/google');

router.get('/signup',  ctrl.getSignup);
router.post('/signup', upload.single('profilePic'), ctrl.postSignup);

router.get('/login',  ctrl.getLogin);
router.post('/login', ctrl.postLogin);

router.get('/logout', ctrl.logout);

router.get('/auth/google',          passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), ctrl.googleCallback);

module.exports = router;
