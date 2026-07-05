const mongoose = require('mongoose');

// NOTE: Do NOT override dns.setServers() here. Forcing DNS through public
// resolvers (8.8.8.8 / 1.1.1.1) breaks the mongodb+srv:// SRV lookup in
// environments that block outbound DNS to those servers, causing the
// connection to hang and queries to "buffer timed out". Use the system
// resolver instead. If a network truly refuses SRV lookups, provide a
// non-SRV MONGO_URI_DIRECT connection string instead.

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
