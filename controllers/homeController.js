const Donor = require('../models/Donor');
const Donation = require('../models/Donation');
const Hospital = require('../models/Hospital');
const Feedback = require('../models/Feedback');

const bloodData = {
  'O-':  { donateTo: ['A+','A-','B+','B-','AB+','AB-','O+','O-'], receiveFrom: ['O-'],                                     population: '6.6%'  },
  'O+':  { donateTo: ['A+','B+','AB+','O+'],                      receiveFrom: ['O+','O-'],                                 population: '37.4%' },
  'A-':  { donateTo: ['A+','A-','AB+','AB-'],                     receiveFrom: ['A-','O-'],                                 population: '6.3%'  },
  'A+':  { donateTo: ['A+','AB+'],                                 receiveFrom: ['A+','A-','O+','O-'],                       population: '35.7%' },
  'B-':  { donateTo: ['B+','B-','AB+','AB-'],                     receiveFrom: ['B-','O-'],                                 population: '1.5%'  },
  'B+':  { donateTo: ['B+','AB+'],                                 receiveFrom: ['B+','B-','O+','O-'],                       population: '8.5%'  },
  'AB-': { donateTo: ['AB+','AB-'],                                receiveFrom: ['AB-','A-','B-','O-'],                      population: '0.6%'  },
  'AB+': { donateTo: ['AB+'],                                      receiveFrom: ['A+','A-','B+','B-','AB+','AB-','O+','O-'], population: '3.4%'  }
};

exports.bloodData = bloodData;

exports.index = async (req, res) => {
  const volunteers = [
    { name: 'JAPNOOR KAUR',   role: 'Blood Donation Manager',  linkedin: '#', twitter: '#', facebook: '#' },
    { name: 'DEVAM VASHISHT', role: 'Donor Relations Manager', linkedin: '#', twitter: '#', facebook: '#' },
    { name: 'DEVANSHU GARG',  role: 'Volunteer Coordinator',   linkedin: '#', twitter: '#', facebook: '#' }
  ];
  const bloodGroups = ['O+','A+','B+','AB+','O-','A-','B-','AB-'];

  const [registeredDonors, successfulDonations, partnerHospitals, donorCities, hospitalCities, donationCities] = await Promise.all([
    Donor.countDocuments({}),
    Donation.countDocuments({ status: 'verified' }),
    Hospital.countDocuments({ isVerified: true }),
    Donor.distinct('city', { city: { $exists: true, $ne: '' } }),
    Hospital.distinct('city', { city: { $exists: true, $ne: '' } }),
    Donation.distinct('city', { city: { $exists: true, $ne: '' } })
  ]);

  const citySet = new Set([
    ...donorCities,
    ...hospitalCities,
    ...donationCities
  ].map(city => String(city).trim().toLowerCase()).filter(Boolean));

  const impactStats = {
    registeredDonors,
    successfulDonations,
    partnerHospitals,
    citiesCovered: citySet.size
  };

  const counts = {};
  for (const g of bloodGroups) counts[g] = await Donor.countDocuments({ bloodGroup: g });

  const testimonials = await Feedback.find({ isPublic: true, rating: { $gte: 4 } })
    .sort({ rating: -1, createdAt: -1 })
    .limit(6)
    .lean();

  const featuredTestimonials = testimonials.map((item) => ({
    ...item,
    title: item.message ? item.message.split(' ').slice(0, 3).join(' ') : 'Feedback',
    subtitle: item.category === 'hospital' ? 'Hospital Partner' : 'Helpline Requester',
    location: item.category === 'hospital' ? 'Delhi, India' : 'Kathmandu, Nepal'
  }));

  res.render('index', { volunteers, counts, bloodGroups, impactStats, testimonials: featuredTestimonials });
};

exports.blood        = (req, res) => res.render('blood', { bloodData });
exports.howItWorks   = (req, res) => res.render('how-it-works');
exports.thankyou     = (req, res) => res.render('thankyou', { donorName: req.query.name || 'Valued Donor' });
exports.notFound     = (req, res) => res.status(404).render('404');

exports.submitFeedback = async (req, res) => {
  try {
    const { name, email, rating, category, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ success: false, error: 'Please fill in your name, email, and message.' });
    }

    await Feedback.create({
      user: res.locals.user?._id || null,
      name,
      email,
      rating: Number(rating) || 5,
      category,
      message,
      isPublic: Number(rating) >= 4
    });

    res.json({ success: true, message: 'Thank you for your feedback.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Something went wrong.' });
  }
};

exports.dashboard    = (req, res) => {
  if (!res.locals.user) {
    req.flash('error', 'Please login to access dashboard');
    return res.redirect('/login');
  }

  const user = res.locals.user;
  
  // Ensure roles field exists (for existing users without it)
  const userRoles = user.roles || ['donor'];
  
  // If user has both roles, show role selection page
  if (userRoles.includes('donor') && userRoles.includes('requester')) {
    return res.render('dashboard-select', { user });
  }
  
  // If user is only donor, redirect to donor dashboard
  if (userRoles.includes('donor')) {
    return res.redirect('/donor/dashboard');
  }
  
  // If user is only requester, redirect to requester dashboard
  if (userRoles.includes('requester')) {
    return res.redirect('/requester/dashboard');
  }
  
  // If user has no roles, default to donor dashboard
  return res.redirect('/donor/dashboard');
};
