const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  razorpayOrderId:   { type: String, required: true },
  razorpayPaymentId: { type: String, required: true, unique: true },
  amount:            { type: Number, required: true },   // in paise
  currency:          { type: String, default: 'INR' },
  name:              { type: String, default: 'Anonymous' },
  email:             { type: String, default: '' },
  user:              { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  paidAt:            { type: Date, default: Date.now }
});

module.exports = mongoose.model('Payment', paymentSchema);
