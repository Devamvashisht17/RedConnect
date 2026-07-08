const Razorpay = require('razorpay');
const crypto   = require('crypto');
const Payment  = require('../models/Payment');

const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

exports.createOrder = async (req, res) => {
  try {
    const amount = parseInt(req.body.amount);
    if (!amount || amount < 100) return res.status(400).json({ error: 'Minimum amount is ₹1 (100 paise).' });

    const order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt: `rc_${Date.now()}`
    });

    res.json({ order_id: order.id, amount: order.amount, currency: order.currency });
  } catch (err) {
    console.error('Razorpay create order error:', err);
    res.status(500).json({ error: 'Could not create payment order.' });
  }
};

exports.verifyPayment = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount, name, email } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature)
    return res.status(400).json({ error: 'Missing payment fields.' });

  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expected !== razorpay_signature)
    return res.status(400).json({ error: 'Payment verification failed.' });

  try {
    await Payment.create({
      razorpayOrderId:   razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      amount:            parseInt(amount) || 0,
      name:              name?.trim() || 'Anonymous',
      email:             email?.trim() || '',
      user:              req.user?._id || null
    });
  } catch (dbErr) {
    console.error('Payment save error:', dbErr.message);
  }

  res.json({ success: true, payment_id: razorpay_payment_id });
};
