//  app.js  –  RedConnect
require('dotenv').config();

const express      = require('express');
const path         = require('path');
const fs           = require('fs');
const mongoose     = require('mongoose');
const bcrypt       = require('bcryptjs');
const jwt          = require('jsonwebtoken');
const multer       = require('multer');
const session      = require('express-session');
const flash        = require('connect-flash');
const cookieParser = require('cookie-parser');

const app  = express();
const PORT = process.env.PORT || 3000;


//  1. MONGODB CONNECTION
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => { console.error('❌ MongoDB error:', err.message); process.exit(1); });


//  2. MONGOOSE SCHEMAS 

// ── User Schema 
const userSchema = new mongoose.Schema({
  name:       { type: String, required: true },
  email:      { type: String, required: true, unique: true },
  password:   { type: String },           
  profilePic: { type: String, default: '' },
  googleId:   { type: String },          
  activity:   { type: String },
  createdAt:  { type: Date, default: Date.now }
});


userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return;
  this.password = await bcrypt.hash(this.password, 10);
});


userSchema.methods.matchPassword = async function (entered) {
  return await bcrypt.compare(entered, this.password);
};

const User = mongoose.model('User', userSchema);

const passport = require('./auth/google');

// ── Donor Schema 
const Donor = mongoose.model('Donor', new mongoose.Schema({
  name:        { type: String, required: true },
  email:       { type: String, required: true },
  phone:       { type: String, required: true },
  dob:         String,
  bloodGroup:  { type: String, required: true },
  city:        { type: String, required: true },
  registeredAt:{ type: Date, default: Date.now }
}));

// ── BloodRequest Schema 
const BloodRequest = mongoose.model('BloodRequest', new mongoose.Schema({
  patientName:     { type: String, required: true },
  patientAge:      Number,
  bloodGroup:      { type: String, default: '' },
  unitsRequired:   Number,
  requiredBefore:  String,
  emergencyLevel:  { type: String, default: 'Normal' },
  hospitalName:    String,
  hospitalAddress: String,
  city:            String,
  state:           String,
  pincode:         String,
  contactName:     String,
  contactPhone:    String,
  status:          { type: String, default: 'Pending' },
  timestamp:       { type: Date, default: Date.now }
}));

// ── Volunteer Schema 
const Volunteer = mongoose.model('Volunteer', new mongoose.Schema({
  name:           { type: String, required: true },
  email:          { type: String, required: true },
  phone:          { type: String, required: true },
  age:            Number,
  city:           String,
  availability:   String,
  skills:         String,
  education:      String,
  graduationYear: String,
  organization:   String,
  interest:       String,
  motivation:     String,
  source:         String,
  hasContact:     String,
  contactName:    String,
  hasExperience:  String,
  experience:     String,
  registeredAt:   { type: Date, default: Date.now }
}));


//  3. MULTER 

const uploadPath = path.join(__dirname, 'public', 'uploads');
console.log('Upload path:', uploadPath);
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename:    (req, file, cb) => {
    const sanitized = file.originalname.replace(/\s+/g, '-');
    cb(null, Date.now() + '-' + sanitized);
  }
});
const upload = multer({ storage });


//  4. MIDDLEWARE SETUP

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { secure: false } }));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());

// ── Custom Middleware: Request Logger
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// ── Custom Middleware: Attach JWT user to res.locals 
app.use(async (req, res, next) => {
  const token = req.cookies?.token;
  res.locals.user = null;
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      res.locals.user = await User.findById(decoded.id).select('-password');
    } catch (err) {
      res.clearCookie('token');
    }
  }
  next();
});

// ── JWT Protect Middleware (for protected routes) 
const protect = async (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) return res.redirect('/login');
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');
    next();
  } catch (err) {
    res.clearCookie('token');
    res.redirect('/login');
  }
};

// ── Helper: Generate JWT
const generateToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

//  6. AUTH ROUTES

// GET /signup
app.get('/signup', (req, res) =>
  res.render('signup', { error: req.flash('error')[0] || null })
);

// POST /signup
app.post('/signup', upload.single('profilePic'), async (req, res) => {
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
    console.log('req.file:', req.file);         // confirms multer received the file
    console.log('profilePic to save:', profilePic); // confirms path being stored in MongoDB
    await User.create({ name, email, password, profilePic });
    console.log('User created with profilePic:', profilePic); // confirms saved to Atlas
    res.render('success', { name });
  } catch (err) {
    console.error('Signup error:', err.message);
    req.flash('error', err.message || 'Something went wrong. Try again.');
    res.redirect('/signup');
  }
});

// GET /login
app.get('/login', (req, res) =>
  res.render('login', { error: req.flash('error')[0] || null })
);

// POST /login
app.post('/login', async (req, res) => {
  const { email, password, activity } = req.body;
  try {
    const user = await User.findOne({ email });

    if (!user) {
      req.flash('error', 'You are not registered. Please Signup first.');
      return res.redirect('/login');
    }
    if (!user.password) {
      req.flash('error', 'Please login with Google.');
      return res.redirect('/login');
    }
    if (!await user.matchPassword(password)) {
      req.flash('error', 'Incorrect password. Try again.');
      return res.redirect('/login');
    }

    res.cookie('token', generateToken(user._id), {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    res.redirect('/');
  } catch (err) {
    req.flash('error', 'Something went wrong. Try again.');
    res.redirect('/login');
  }
});

// GET /home – protected
app.get('/home', protect, (req, res) =>
  res.render('home', { user: req.user })
);

// GET /logout
app.get('/logout', (req, res) => {
  res.clearCookie('token');
  req.session.destroy();
  res.redirect('/');
});

// ── Google OAuth 
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    res.cookie('token', generateToken(req.user._id), {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    res.redirect('/');
  }
);

// 
//  7. WEBSITE ROUTES
// 

app.get('/', async (req, res) => {
  const volunteers = [
    { name: 'JAPNOOR KAUR',   role: 'Blood Donation Manager',  linkedin: '#', twitter: '#', facebook: '#' },
    { name: 'DEVAM VASHISHT', role: 'Donor Relations Manager', linkedin: '#', twitter: '#', facebook: '#' },
    { name: 'DEVANSHU GARG',  role: 'Volunteer Coordinator',   linkedin: '#', twitter: '#', facebook: '#' }
  ];
  const bloodGroups = ['O+','A+','B+','AB+','O-','A-','B-','AB-'];
  const counts = {};
  for (const g of bloodGroups) counts[g] = await Donor.countDocuments({ bloodGroup: g });
  res.render('index', { volunteers, counts, bloodGroups });
});

const bloodData = {
  'O-':  { donateTo: ['A+','A-','B+','B-','AB+','AB-','O+','O-'], receiveFrom: ['O-'],                                    population: '6.6%'  },
  'O+':  { donateTo: ['A+','B+','AB+','O+'],                      receiveFrom: ['O+','O-'],                                population: '37.4%' },
  'A-':  { donateTo: ['A+','A-','AB+','AB-'],                     receiveFrom: ['A-','O-'],                                population: '6.3%'  },
  'A+':  { donateTo: ['A+','AB+'],                                 receiveFrom: ['A+','A-','O+','O-'],                      population: '35.7%' },
  'B-':  { donateTo: ['B+','B-','AB+','AB-'],                     receiveFrom: ['B-','O-'],                                population: '1.5%'  },
  'B+':  { donateTo: ['B+','AB+'],                                 receiveFrom: ['B+','B-','O+','O-'],                      population: '8.5%'  },
  'AB-': { donateTo: ['AB+','AB-'],                                receiveFrom: ['AB-','A-','B-','O-'],                     population: '0.6%'  },
  'AB+': { donateTo: ['AB+'],                                      receiveFrom: ['A+','A-','B+','B-','AB+','AB-','O+','O-'], population: '3.4%' }
};

app.get('/blood',        (req, res) => res.render('blood', { bloodData }));
app.get('/how-it-works', (req, res) => res.render('how-it-works'));


app.get('/register', (req, res) => res.render('register'));
app.get('/donors/:group', async (req, res) => {
  const group = decodeURIComponent(req.params.group);
  const groupDonors = await Donor.find({ bloodGroup: group });
  res.render('donors-group', { group, groupDonors, compat: bloodData[group] || null });
});
app.post('/register', async (req, res) => {
  try {
    const donor = await Donor.create({
      name: req.body.name, email: req.body.email, phone: req.body.phone,
      dob: req.body.dob, bloodGroup: req.body.bloodGroup, city: req.body.city
    });
    res.redirect(`/thankyou?name=${encodeURIComponent(donor.name)}`);
  } catch (err) { res.redirect('/register'); }
});

app.get('/request', (req, res) => res.render('request', { success: false }));
app.post('/request-blood', async (req, res) => {
  try {
    await BloodRequest.create({
      patientName:    req.body.patientName,
      bloodGroup:     req.body.bloodGroup,
      hospitalName:   req.body.hospitalName,
      city:           req.body.city,
      contactName:    req.body.contactName,
      contactPhone:   req.body.contactPhone,
      emergencyLevel: req.body.emergencyLevel
    });
    res.redirect('/thankyou?name=' + encodeURIComponent(req.body.contactName || 'User'));
  } catch (err) {
    console.error('Blood request error:', err.message);
    res.redirect('/request');
  }
});

app.get('/volunteer', (req, res) => res.render('volunteer'));
app.post('/volunteer', async (req, res) => {
  try {
    const v = await Volunteer.create({
      name:         req.body.name,
      email:        req.body.email,
      phone:        req.body.phone,
      age:          req.body.age,
      city:         req.body.city,
      availability: req.body.availability,
      skills:       req.body.skills
    });
    res.redirect('/thankyou?name=' + encodeURIComponent(v.name));
  } catch (err) {
    console.error('Volunteer error:', err.message);
    res.redirect('/volunteer');
  }
});

app.get('/thankyou',        (req, res) => res.render('thankyou', { donorName: req.query.name || 'Valued Donor' }));
app.get('/request-success', (req, res) => res.render('request-success'));


//  8. ERROR HANDLING MIDDLEWARE


app.use((req, res) => res.status(404).render('404'));

app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack);
  res.status(500).send('Something went wrong.');
});



app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));


app.get('/ping', (req, res) => {
  res.status(200).send("OK");
});