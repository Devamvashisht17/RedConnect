const mongoose = require('mongoose');

const hospitalSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  email:        { type: String, required: true, unique: true },
  password:     { type: String, required: true },
  phone:        { type: String, required: true },
  address:      { type: String, required: true },
  city:         { type: String, required: true },
  pincode:      { type: String },
  location: {
    type:        { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] } // [lng, lat]
  },
  isVerified:   { type: Boolean, default: false },
  verifiedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedAt:   Date,
  inventory: [{
    bloodGroup:  { type: String, required: true },
    units:       { type: Number, default: 0 },
    updatedAt:   { type: Date, default: Date.now }
  }],
  totalRequests:    { type: Number, default: 0 },
  fulfilledRequests:{ type: Number, default: 0 },
  createdAt:        { type: Date, default: Date.now }
}, { timestamps: true });

hospitalSchema.index({ location: '2dsphere' });
hospitalSchema.index({ city: 1, isVerified: 1 });

module.exports = mongoose.model('Hospital', hospitalSchema);
