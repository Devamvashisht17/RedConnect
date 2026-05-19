const mongoose = require('mongoose');

module.exports = mongoose.model('BloodRequest', new mongoose.Schema({
  patientName:     { type: String, required: true },
  bloodGroup:      { type: String, default: '' },
  emergencyLevel:  { type: String, default: 'Normal' },
  hospitalName:    String,
  city:            String,
  contactName:     String,
  contactPhone:    String,
  status:          { type: String, default: 'Pending' },
  timestamp:       { type: Date, default: Date.now }
}));
