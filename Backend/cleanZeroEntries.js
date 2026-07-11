require('dotenv').config();
const mongoose = require('mongoose');
const MilkRecord = require('./src/models/MilkRecord');
const PurchaseLedger = require('./src/models/PurchaseLedger');
const SaleLedger = require('./src/models/SaleLedger');

mongoose.connect(process.env.MONGO_URI).then(async () => {
  console.log('Connected. Cleaning 0,0 entries...\n');

  // MilkRecord: vol=0 aur amount=0 dono
  const mrDel = await MilkRecord.deleteMany({ vol: { $lte: 0 }, amount: { $lte: 0 } });
  console.log('MilkRecord 0,0 deleted:', mrDel.deletedCount);

  // PurchaseLedger: sab zero — genuinely empty entries
  const plDel = await PurchaseLedger.deleteMany({
    milkLiter: { $lte: 0 },
    totalAmount: { $lte: 0 },
    advanceAmount: { $lte: 0 },
    paymentReceived: { $lte: 0 },
    discountAmount: { $lte: 0 }
  });
  console.log('PurchaseLedger fully-zero deleted:', plDel.deletedCount);

  // SaleLedger: sab zero
  const slDel = await SaleLedger.deleteMany({
    milkLiter: { $lte: 0 },
    totalAmount: { $lte: 0 },
    advanceAmount: { $lte: 0 },
    paymentReceived: { $lte: 0 },
    discountAmount: { $lte: 0 }
  });
  console.log('SaleLedger fully-zero deleted:', slDel.deletedCount);

  console.log('\nDone! Refresh the app.');
  mongoose.disconnect();
}).catch(e => { console.error(e.message); process.exit(1); });
