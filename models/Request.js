const mongoose = require('mongoose');

const requestSchema = new mongoose.Schema({
  patientName:          { type: String, required: true, trim: true },
  bloodGroupRequired:   { type: String, required: true, enum: ['A+','A-','B+','B-','AB+','AB-','O+','O-'] },
  bloodGroup:           { type: String, enum: ['A+','A-','B+','B-','AB+','AB-','O+','O-'] },
  unitsRequired:        { type: Number, required: true, min: 1, default: 1 },
  hospitalName:         { type: String, required: true, trim: true },
  city:                 { type: String, required: true, trim: true },
  contactNumber:        { type: String, required: true, trim: true },
  contactPhone:         { type: String, trim: true },
  contactName:          { type: String, trim: true },
  emergencyLevel:       { type: String, required: true, enum: ['Critical', 'Urgent', 'Normal'], default: 'Normal' },
  additionalMessage:    { type: String, default: '', trim: true },
  status:               { type: String, enum: ['pending', 'matched', 'accepted', 'completed', 'rejected', 'deleted', 'Pending', 'Matched', 'Accepted', 'Completed', 'Rejected', 'Deleted', 'Fulfilled'], default: 'pending' },
  compatibleDonorCount: { type: Number, default: 0 },
  acceptedDonor:        { type: mongoose.Schema.Types.ObjectId, ref: 'Donor' },
  acceptedBy:           { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  handledBy:            { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  completedAt:          Date,
  patientAge:           Number,
  hospitalRef:          { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  hospitalVerified:     { type: Boolean, default: false },
  requesterEmail:       { type: String, trim: true },
  location:             { type: mongoose.Schema.Types.Mixed },
  timestamp:            { type: Date, default: Date.now },
  awaitingAdminVerification: { type: Boolean, default: false },
  scheduledVisitAt:     Date,
  matchedDonors: [{
    donor:            { type: mongoose.Schema.Types.ObjectId, ref: 'Donor', required: true },
    user:             { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    cityMatch:        { type: Boolean, default: false },
    notifiedAt:       { type: Date, default: Date.now },
    responseStatus:   { type: String, enum: ['pending', 'accepted', 'declined', 'closed'], default: 'pending' },
    healthStatus:     { type: String, enum: ['pending', 'scheduled', 'verified', 'unfit', 'healthy', 'unhealthy', 'cooldown'], default: 'pending' },
    healthCheckedAt:  Date,
    scheduledVisitAt: Date,
    respondedAt:      Date,
    note:             { type: String, default: '' }
  }]
}, { timestamps: true, collection: 'requests' });

requestSchema.index({ status: 1, createdAt: -1 });
requestSchema.index({ bloodGroupRequired: 1, city: 1, status: 1 });
requestSchema.index({ contactNumber: 1, status: 1, createdAt: -1 });

const Request = mongoose.models.Request || mongoose.model('Request', requestSchema);

if (!mongoose.models.BloodRequest) {
  mongoose.model('BloodRequest', requestSchema, 'requests');
}

module.exports = Request;