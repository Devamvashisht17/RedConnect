const mongoose = require('mongoose');

module.exports = mongoose.model('Volunteer', new mongoose.Schema({
  name:         { type: String, required: true },
  email:        { type: String, required: true },
  phone:        { type: String, required: true },
  age:          Number,
  city:         String,
  availability: String,
  skills:       String,
  registeredAt: { type: Date, default: Date.now }
}));
