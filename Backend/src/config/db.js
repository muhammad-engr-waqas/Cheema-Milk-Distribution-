const mongoose = require('mongoose');

// ─── Vercel Serverless Connection Caching ─────────────────────────────────────
// BUG FIX / IMPROVEMENT: Pehle sirf module-level `isConnected` variable use
// hota tha. Vercel serverless har "cold start" (naya container) pe module
// dobara load karta hai, is liye purana connection cache kaam nahi karta aur
// har cold start pe MongoDB Atlas se dobara connect hone mein 5-7 second lag
// jaate the. `global` object par cache karne se agar container thoda der warm
// rahe to agli requests fast hongi. Connection timeouts bhi tight kiye hain
// taake agar DB genuinely unreachable ho to request 5-7 sec ki jagah jaldi
// (aur clear error ke saath) fail ho, hang na ho.
if (!global._mongooseConn) {
  global._mongooseConn = { conn: null, promise: null };
}
const cached = global._mongooseConn;

const connectDB = async () => {
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!process.env.MONGO_URI) {
    throw new Error(
      'MONGO_URI environment variable set nahi hai. Vercel project settings > Environment Variables mein MONGO_URI add karo aur redeploy karo.'
    );
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,      // Query turant fail ho, silently hang na ho
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 8000,  // Atlas se initial connect ke liye max wait
      socketTimeoutMS: 20000,
    };
    cached.promise = mongoose.connect(process.env.MONGO_URI, opts).then((m) => {
      console.log(`✓ MongoDB Connected: ${m.connection.host}`);
      return m;
    }).catch((err) => {
      cached.promise = null; // agli request pe dobara try ho sake
      throw err;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    console.error(`✗ MongoDB Connection Error: ${error.message}`);
    throw error;
  }

  return cached.conn;
};

module.exports = connectDB;
