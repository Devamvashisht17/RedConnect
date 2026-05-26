// auth/google.js - Google OAuth 2.0 using Passport.js
const passport       = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const mongoose       = require('mongoose');

const User = mongoose.model('User');

passport.use(new GoogleStrategy({
  clientID:     process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL:  process.env.GOOGLE_CALLBACK_URL
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const googleId   = profile.id;
    const email      = profile.emails[0].value.toLowerCase();
    const profilePic = profile.photos[0]?.value || '';

    let user = await User.findOne({ googleId });
    if (user) return done(null, user);

    user = await User.findOne({ email });
    if (user) {
      user.googleId = googleId;
      if (profilePic && !user.profilePic) user.profilePic = profilePic;
      await user.save();
      return done(null, user);
    }

    user = await User.create({
      name: profile.displayName,
      email,
      googleId,
      profilePic
    });
    return done(null, user);
  } catch (err) {
    return done(err, null);
  }
}));

passport.serializeUser((user, done) => done(null, user._id));

passport.deserializeUser(async (id, done) => {
  try   { done(null, await User.findById(id)); }
  catch (err) { done(err, null); }
});

module.exports = passport;
