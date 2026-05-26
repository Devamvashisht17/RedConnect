const dns = require('dns');
const mongoose = require('mongoose');

// Some networks/ISPs refuse SRV lookups (querySrv EREFUSED) for mongodb+srv://
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

const connectDB = async () => {
  const uri =
    process.env.MONGO_URI_DIRECT ||
    process.env.MONGO_URI;

  if (!uri) {
    console.error('❌ MongoDB: set MONGO_URI or MONGO_URI_DIRECT in .env');
    return;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000,
      family: 4
    });
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB error:', err.message);
    if (err.message.includes('querySrv') || err.code === 'EREFUSED') {
      console.error(
        '   Tip: Use MONGO_URI_DIRECT (non-SRV) in .env — see .env.example or Atlas → Connect → Drivers.'
      );
    }
  }
};

module.exports = connectDB;
