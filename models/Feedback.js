const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true },
  rating: { type: Number, min: 1, max: 5, default: 5 },
  category: { type: String, default: 'general' },
  message: { type: String, required: true, trim: true },
  isPublic: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Feedback || mongoose.model('Feedback', feedbackSchema);
