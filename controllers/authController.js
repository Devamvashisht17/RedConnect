const jwt  = require('jsonwebtoken');
const User = require('../models/User');

const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

const cookieOpts = { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 };

exports.getSignup = (req, res) =>
  res.render('signup', { error: req.flash('error')[0] || null });

exports.postSignup = async (req, res) => {
  const { name, email, password, confirmPassword } = req.body;
  if (password !== confirmPassword) {
    req.flash('error', 'Passwords do not match');
    return res.redirect('/signup');
  }
  try {
    if (await User.findOne({ email })) {
      req.flash('error', 'User already registered. Please login.');
      return res.redirect('/signup');
    }
    const profilePic = req.file ? '/uploads/' + req.file.filename : '';
    await User.create({ name, email, password, profilePic });
    res.render('success', { name });
  } catch (err) {
    req.flash('error', err.message || 'Something went wrong.');
    res.redirect('/signup');
  }
};

exports.getLogin = (req, res) =>
  res.render('login', { error: req.flash('error')[0] || null });

exports.postLogin = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user)                              { req.flash('error', 'Not registered. Please signup.'); return res.redirect('/login'); }
    if (!user.password)                     { req.flash('error', 'Please login with Google.');      return res.redirect('/login'); }
    if (!await user.matchPassword(password)){ req.flash('error', 'Incorrect password.');            return res.redirect('/login'); }
    res.cookie('token', generateToken(user._id), cookieOpts);
    res.redirect('/');
  } catch (err) {
    req.flash('error', 'Something went wrong.');
    res.redirect('/login');
  }
};

exports.logout = (req, res) => {
  res.clearCookie('token');
  req.session.destroy();
  res.redirect('/');
};

exports.googleCallback = (req, res) => {
  res.cookie('token', generateToken(req.user._id), cookieOpts);
  res.redirect('/');
};
