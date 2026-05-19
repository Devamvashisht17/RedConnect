const mongoose = require('mongoose');

module.exports = mongoose.model('Donor', new mongoose.Schema({
  name:         { type: String, required: true },
  email:        { type: String, required: true },
  phone:        { type: String, required: true },
  dob:          String,
  bloodGroup:   { type: String, required: true },
  city:         { type: String, required: true },
  registeredAt: { type: Date, default: Date.now }
}));
