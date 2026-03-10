const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'redconnect-secret-key',
  resave: false,
  saveUninitialized: false
}));

app.get('/', (req, res) => {
  const volunteers = [
    {
      name: 'JAPNOOR KAUR',
      role: 'Blood Donation Manager',
      linkedin: '#',
      twitter: '#',
      facebook: '#'
    },
    {
      name: 'DEVAM VASHISHT',
      role: 'Donor Relations Manager',
      linkedin: '#',
      twitter: '#',
      facebook: '#'
    },
    {
      name: 'DEVANSHU GARG',
      role: 'Volunteer Coordinator',
      linkedin: '#',
      twitter: '#',
      facebook: '#'
    }
  ];
  res.render('index', { volunteers, user: req.session.user || null });
});

app.get('/volunteer', (req, res) => {
  res.render('volunteer');
});

app.post('/volunteer', (req, res) => {
  const volunteerData = {
    name: req.body.name,
    email: req.body.email,
    phone: req.body.phone,
    age: req.body.age,
    city: req.body.city,
    availability: req.body.availability,
    skills: req.body.skills,
    registeredAt: new Date().toISOString()
  };

  const filePath = path.join(__dirname, 'volunteers.json');
  
  let volunteers = [];
  if (fs.existsSync(filePath)) {
    const fileData = fs.readFileSync(filePath, 'utf8');
    volunteers = JSON.parse(fileData);
  }
  
  volunteers.push(volunteerData);
  fs.writeFileSync(filePath, JSON.stringify(volunteers, null, 2));
  
  app.get('/thankyou', (req, res) => {
  res.render('thankyou', { name: req.session.name });
});
});

app.get('/request', (req, res) => {
  res.render('request');
});

app.post('/request', (req, res) => {
  const requestData = {
    name: req.body.name,
    email: req.body.email,
    phone: req.body.phone,
    bloodGroup: req.body.bloodGroup,
    city: req.body.city,
    hospital: req.body.hospital,
    urgency: req.body.urgency,
    requestedAt: new Date().toISOString()
  };

  const filePath = path.join(__dirname, 'requests.json');
  
  let requests = [];
  if (fs.existsSync(filePath)) {
    const fileData = fs.readFileSync(filePath, 'utf8');
    requests = JSON.parse(fileData);
  }
  
  requests.push(requestData);
  fs.writeFileSync(filePath, JSON.stringify(requests, null, 2));
  
 req.session.name = requestData.name;
res.redirect('/request-success');
});

app.get('/signup', (req, res) => {
  res.render('signup', { error: null });
});

app.post('/signup', (req, res) => {
  const { name, email, password, confirmPassword, activity } = req.body;
  
  if (password !== confirmPassword) {
    return res.render('signup', { error: 'Passwords do not match' });
  }
  
  const usersPath = path.join(__dirname, 'users.json');
  let users = [];
  
  if (fs.existsSync(usersPath)) {
    users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
  }
  
  const existingUser = users.find(u => u.email === email);
  if (existingUser) {
    return res.render('signup', { error: 'User already registered. Please login.' });
  }
  
  users.push({ name, email, password, activity });
  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
  
  res.render('success', { name });
});

app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { email, password, activity } = req.body;
  
  const usersPath = path.join(__dirname, 'users.json');
  let users = [];
  
  if (fs.existsSync(usersPath)) {
    users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
  }
  
  const user = users.find(u => u.email === email);
  
  if (!user) {
    return res.render('login', { error: 'You are not registered. Please Signup first.' });
  }
  
  if (user.password !== password) {
    return res.render('login', { error: 'Incorrect password. Try again.' });
  }
  
  user.activity = activity;
  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
  
  req.session.user = {
    name: user.name,
    email: user.email,
    activity: activity
  };
  
  res.redirect('/');
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

app.get('/register', (req, res) => {
  res.render('register');
});

app.post('/register', (req, res) => {
  const donorData = {
    name: req.body.name,
    email: req.body.email,
    phone: req.body.phone,
    dob: req.body.dob,
    bloodGroup: req.body.bloodGroup,
    city: req.body.city,
    registeredAt: new Date().toISOString()
  };

  const filePath = path.join(__dirname, 'donors.json');
  
  let donors = [];
  if (fs.existsSync(filePath)) {
    const fileData = fs.readFileSync(filePath, 'utf8');
    donors = JSON.parse(fileData);
  }
  
  donors.push(donorData);
  fs.writeFileSync(filePath, JSON.stringify(donors, null, 2));
  
  res.redirect(`/thankyou?name=${encodeURIComponent(donorData.name)}`);
});

app.get('/thankyou', (req, res) => {
  const donorName = req.query.name || 'Valued Donor';
  res.render('thankyou', { donorName: donorName });
});

// 404 Error Handler - Must be at the end
app.use((req, res) => {
  res.status(404).render('404');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
