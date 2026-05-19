const mongoose = require('mongoose');

const bloodBankSchema = new mongoose.Schema({
  name:    { type: String, required: true },
  email:   { type: String, required: true, unique: true },
  phone:   { type: String, required: true },
  address: { type: String, required: true },
  city:    { type: String, required: true },
  location: {
    type:        { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] }
  },
  isVerified: { type: Boolean, default: false },
  inventory: [{
    bloodGroup:    { type: String, required: true },
    units:         { type: Number, default: 0 },
    criticalLevel: { type: Number, default: 5 }, // alert if below this
    updatedAt:     { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

bloodBankSchema.index({ location: '2dsphere' });
bloodBankSchema.index({ city: 1 });

module.exports = mongoose.model('BloodBank', bloodBankSchema);
