require('dotenv').config();

const express      = require('express');
const path         = require('path');
const session      = require('express-session');
const MongoStore   = require('connect-mongo');
const flash        = require('connect-flash');
const cookieParser = require('cookie-parser');
const jwt          = require('jsonwebtoken');

const connectDB = require('./config/db');
const User      = require('./models/User');

// ── Connect DB
connectDB();

// ── Init passport AFTER models are loaded
const passport = require('./auth/google');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret:            process.env.SESSION_SECRET || 'fallback-secret',
  resave:            false,
  saveUninitialized: false,
  store:             MongoStore.create({
    mongoUrl:        process.env.MONGO_URI,
    collectionName:  'sessions',
    ttl:             7 * 24 * 60 * 60
  }),
  cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true }
}));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());

// ── Attach JWT user to res.locals (for views/navbar)
app.use(async (req, res, next) => {
  const token = req.cookies?.token;
  res.locals.user = null;
  if (token) {
    try {
      const decoded  = jwt.verify(token, process.env.JWT_SECRET);
      res.locals.user = await User.findById(decoded.id).select('-password');
    } catch {
      res.clearCookie('token');
    }
  }
  next();
});

// ── Request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// ── Health check — Render pings this to verify app is alive
app.get('/health', (req, res) => res.status(200).send('OK'));

// ── Routes
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/home'));
app.use('/', require('./routes/donorRoutes'));
app.use('/', require('./routes/requestRoutes'));
app.use('/', require('./routes/volunteerRoutes'));

// ── Existing modular routes
app.use('/admin',    require('./routes/admin'));
app.use('/donor',    require('./routes/donor'));
app.use('/hospital', require('./routes/hospital'));

// ── 404
app.use((req, res) => res.status(404).render('404'));

// ── Error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack);
  res.status(500).send('Something went wrong.');
});

module.exports = app;
