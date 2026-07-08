require('dotenv').config();
const express      = require('express');
const path         = require('path');
const session      = require('express-session');
const MongoStore = require('connect-mongo').default;
const cookieParser = require('cookie-parser');
const jwt          = require('jsonwebtoken');
const flash        = require('connect-flash');

const connectDB = require('./config/db');
const User      = require('./models/User');

// Connect DB
connectDB();

// Register models used by populate() across routes (avoids MissingSchemaError on cold paths)
require('./models/Donor');
require('./models/User');
require('./models/Notification');
require('./models/Request');
require('./models/DoctorScreening');
require('./models/Certificate');
require('./models/Payment');

// Init passport AFTER models are loaded
const passport = require('./auth/google');

const app = express();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use((req, res, next) => {
  const isStaticAsset = req.path.startsWith('/css/') || req.path.startsWith('/js/') || req.path.startsWith('/images/') || req.path.startsWith('/uploads/') || req.path.startsWith('/favicon') || req.path.startsWith('/fonts/');

  if (!isStaticAsset) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }

  next();
});
app.use(session({
  secret:            process.env.SESSION_SECRET || 'fallback-secret',
  resave:            false,
  saveUninitialized: false,
  store:             MongoStore.create({
    mongoUrl:       process.env.MONGO_URI,
    collectionName: 'sessions',
    ttl:            7 * 24 * 60 * 60
  }),
  cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, sameSite: 'lax' }
}));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());

// Attach JWT user to res.locals (for views/navbar)
app.use(async (req, res, next) => {
  const token = req.cookies?.token;
  res.locals.user = null;
  if (token) {
    try {
      const decoded   = jwt.verify(token, process.env.JWT_SECRET);
      res.locals.user = await User.findById(decoded.id).select('-password');
    } catch {
      res.clearCookie('token');
    }
  }
  next();
});

// Attach flash messages to res.locals (for views alert banner)
app.use((req, res, next) => {
  res.locals.success = req.flash('success')[0] || null;
  res.locals.error = req.flash('error')[0] || null;
  next();
});

// Request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// Health check — Render pings this to verify app is alive
app.get('/health', (req, res) => res.status(200).send('OK'));

// Routes
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/home'));
app.use('/', require('./routes/donorRoutes'));
app.use('/', require('./routes/requestRoutes'));
app.use('/', require('./routes/volunteerRoutes'));

// Modular routes
app.use('/admin',     require('./routes/admin'));
app.use('/donor',     require('./routes/donor'));
app.use('/api/donor', require('./routes/donorApi'));
app.use('/requester', require('./routes/requester'));
app.use('/hospital',  require('./routes/hospital'));
app.use('/api', require('./routes/payment'));
app.use('/chatbot',   require('./routes/chatbot'));
app.use('/requester', require('./routes/requesterRoutes'));

// Subscribe
app.post('/subscribe', async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.json({ success: false, error: 'Please enter a valid email.' });
  }
  try {
    const Subscriber = require('./models/Subscriber');
    const { sendSubscribeConfirmMail } = require('./services/emailService');
    const existing = await Subscriber.findOne({ email });
    if (existing) return res.json({ success: false, error: 'You are already subscribed!' });
    await Subscriber.create({ email });
    sendSubscribeConfirmMail(email).catch(() => {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Something went wrong.' });
  }
});

// Certificate download (auth-protected, works for both donor and admin)
app.get('/generate-certificate/:id', require('./middleware/authMiddleware').protect, require('./controllers/certificateController').generateCertificate);
// 404
app.use((req, res) => res.status(404).render('404'));

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).send('Something went wrong.');
});

module.exports = app;
