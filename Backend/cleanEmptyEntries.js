const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
  const SaleLedger = require('./src/models/SaleLedger');
  const PurchaseLedger = require('./src/models/PurchaseLedger');

  // Delete completely empty SaleLedger entries (all values are 0)
  const emptyResult = await SaleLedger.deleteMany({
    milkLiter: { $in: [0, null] },
    totalAmount: { $in: [0, null] },
    advanceAmount: { $in: [0, null] },
    paymentReceived: { $in: [0, null] },
    vehicleRent: { $in: [0, null] },
    discountAmount: { $in: [0, null] },
    spoiledAmount: { $in: [0, null] },
  });
  console.log(`Deleted ${emptyResult.deletedCount} empty SaleLedger entries`);

  // Same for PurchaseLedger
  const emptyPurchase = await PurchaseLedger.deleteMany({
    milkLiter: { $in: [0, null] },
    totalAmount: { $in: [0, null] },
    advanceAmount: { $in: [0, null] },
    paymentReceived: { $in: [0, null] },
    discountAmount: { $in: [0, null] },
  });
  console.log(`Deleted ${emptyPurchase.deletedCount} empty PurchaseLedger entries`);

  // Show remaining
  const remaining = await SaleLedger.countDocuments();
  console.log(`SaleLedger remaining entries: ${remaining}`);

  await mongoose.disconnect();
  console.log('Done!');
}).catch(e => { console.error(e); process.exit(1); });
