const Donor = require('../models/Donor');
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

  const [registeredDonors, partnerHospitals, donorCities, hospitalCities] = await Promise.all([
    Donor.countDocuments({}),
    Hospital.countDocuments({ isVerified: true }),
    Donor.distinct('city', { city: { $exists: true, $ne: '' } }),
    Hospital.distinct('city', { city: { $exists: true, $ne: '' } })
  ]);

  const citySet = new Set([
    ...donorCities,
    ...hospitalCities
  ].map(city => String(city).trim().toLowerCase()).filter(Boolean));

  const impactStats = {
    registeredDonors,
    successfulDonations: 0,
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

  res.render('index', { volunteers, counts, bloodGroups, impactStats, testimonials: featuredTestimonials, razorpayKeyId: process.env.RAZORPAY_KEY_ID });
};

exports.blood        = (req, res) => res.render('blood', { bloodData });
exports.howItWorks   = (req, res) => res.render('how-it-works');
exports.thankyou     = (req, res) => res.render('thankyou', { donorName: req.query.name || 'Valued Donor' });
exports.notFound     = (req, res) => res.status(404).render('404');

exports.feedbackPage = async (req, res) => {
  const testimonials = await Feedback.find({ isPublic: true, rating: { $gte: 4 } })
    .sort({ rating: -1, createdAt: -1 })
    .limit(12)
    .lean();

  const featured = testimonials.map((item) => ({
    ...item,
    subtitle: item.category === 'hospital' ? 'Hospital Partner' : 'Helpline Requester'
  }));

  res.render('feedback', { testimonials: featured });
};

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

exports.dashboard = (req, res) => {
  const user = req.user;
  if (!user) return res.redirect('/login');

  const roles = user.roles || [];

  if (roles.includes('donor') && roles.includes('requester'))
    return res.render('dashboard-select', { user });

  if (roles.includes('donor'))
    return res.redirect('/donor/dashboard');

  if (roles.includes('requester'))
    return res.redirect('/requester/dashboard');

  // No roles — show select page so user can choose
  return res.render('dashboard-select', { user });
};
