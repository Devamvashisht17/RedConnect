const Donor = require('../models/Donor');

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
  const counts = {};
  for (const g of bloodGroups) counts[g] = await Donor.countDocuments({ bloodGroup: g });
  res.render('index', { volunteers, counts, bloodGroups });
};

exports.blood        = (req, res) => res.render('blood', { bloodData });
exports.howItWorks   = (req, res) => res.render('how-it-works');
exports.thankyou     = (req, res) => res.render('thankyou', { donorName: req.query.name || 'Valued Donor' });
exports.notFound     = (req, res) => res.status(404).render('404');
