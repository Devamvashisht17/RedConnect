const mongoose = require('mongoose');

const doctorScreeningSchema = new mongoose.Schema({
  donor:           { type: mongoose.Schema.Types.ObjectId, ref: 'Donor', required: true },
  request:         { type: mongoose.Schema.Types.ObjectId, ref: 'Request', required: true },
  donorName:       { type: String, required: true },
  donorEmail:      { type: String, required: true },
  donorPhone:      { type: String, default: '' },
  bloodGroup:      { type: String, required: true },
  hospitalName:    { type: String, required: true },
  requesterName:   { type: String, default: '' },
  requesterEmail:  { type: String, default: '' },
  screeningStatus: { type: String, enum: ['Pending', 'Fit', 'Unfit'], default: 'Pending' },
  donationStatus:  { type: String, enum: ['Waiting for Screening', 'Eligible', 'Rejected', 'Donated'], default: 'Waiting for Screening' },
  doctorName:      { type: String, default: '' },
  remarks:         { type: String, default: '' },
  screeningDate:   { type: Date },
}, { timestamps: true });

// Prevent duplicate screening records for same donor+request
doctorScreeningSchema.index({ donor: 1, request: 1 }, { unique: true });

module.exports = mongoose.model('DoctorScreening', doctorScreeningSchema);
