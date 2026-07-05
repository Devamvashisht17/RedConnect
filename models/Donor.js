const mongoose = require('mongoose');

module.exports = mongoose.model('Donor', new mongoose.Schema({
  user:         { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name:         { type: String, required: true },
  email:        { type: String, required: true },
  phone:        { type: String },
  dob:          String,
  bloodGroup:   { type: String },
  city:         { type: String },
  availability: { type: Boolean, default: true },
  availabilityNote: { type: String, default: '' },
  registeredAt: { type: Date, default: Date.now }
}));
