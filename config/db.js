const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB connected');
  } catch (err) {
    // Log error but do NOT exit — let server stay alive on Render
    console.error('❌ MongoDB error:', err.message);
  }
};

module.exports = connectDB;
