const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipientType: { type: String, enum: ['donor', 'requester', 'admin'], required: true },
  donor:         { type: mongoose.Schema.Types.ObjectId, ref: 'Donor' },
  user:          { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  request:       { type: mongoose.Schema.Types.ObjectId, ref: 'Request', required: true },
  title:         { type: String, required: true, trim: true },
  message:       { type: String, required: true, trim: true },
  type:          { type: String, enum: ['request-match', 'request-accepted', 'request-declined', 'request-completed', 'manual-assignment', 'admin-alert'], default: 'request-match' },
  actionUrl:     { type: String, default: '' },
  isRead:        { type: Boolean, default: false },
  metadata:      { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

notificationSchema.index({ recipientType: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ request: 1, createdAt: -1 });

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);