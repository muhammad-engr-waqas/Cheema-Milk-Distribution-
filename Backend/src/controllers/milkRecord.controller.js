const MilkRecord = require('../models/MilkRecord');
const PurchaseLedger = require('../models/PurchaseLedger');
const SaleLedger = require('../models/SaleLedger');
const SupplierProfile = require('../models/SupplierProfile');
const CustomerProfile = require('../models/CustomerProfile');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * @route   GET /api/milk-records
 * @desc    Milk records lo — PurchaseLedger + SaleLedger se NET values
 *          (spoiled liters/amount already minus hote hain)
 *          Frontend MilkTransactionContext.syncFromBackend() ke liye
 * Query params: type (Purchase|Sale), date, partyName, startDate, endDate
 */
const getMilkRecords = asyncHandler(async (req, res) => {
  const purchaseFilter = {};
  const saleFilter = {};

  if (req.query.date) {
    purchaseFilter.date = req.query.date;
    saleFilter.date = req.query.date;
  }
  if (req.query.startDate && req.query.endDate) {
    purchaseFilter.date = { $gte: req.query.startDate, $lte: req.query.endDate };
    saleFilter.date = { $gte: req.query.startDate, $lte: req.query.endDate };
  }
  if (req.query.partyName) {
    purchaseFilter.supplierName = new RegExp(req.query.partyName, 'i');
    saleFilter.customerName = new RegExp(req.query.partyName, 'i');
  }

  const wantType = req.query.type; // 'Purchase' | 'Sale' | undefined (both)

  let purchaseRecords = [];
  let saleRecords = [];

  // ── Purchase records — net of spoiled ─────────────────────────────────────
  // FIX: Sirf woh PurchaseLedger entries milk records mein show karo jo
  // MilkPurchases screen ya route-collection se aayi hain (isManual: false).
  // PurchaseLedger.tsx se manually add kari entries (isManual: true) ko
  // getMilkRecords se EXCLUDE karo — woh sirf ledger/balance ke liye hain,
  // milk purchase history mein nahi dikhni chahiye.
  if (!wantType || wantType === 'Purchase') {
    const entries = await PurchaseLedger.find({
      ...purchaseFilter,
      isManual: false,  // Manual (amount-only) entries milk records mein nahi jaayengi
      $or: [
        { milkLiter: { $gt: 0 } },
        { totalAmount: { $gt: 0 } },
      ],
    }).sort({ date: -1, createdAt: -1 });
    purchaseRecords = await Promise.all(entries.map(async (e) => {
      let fat = e.fat || 0;
      let lr  = e.lr  || 0;
      let snf = e.snf || 0;
      let totalTs = e.totalTs || 0;

      // If fat/snf/totalTs are missing, look them up from linked MilkRecord
      if (!fat && !snf && !totalTs && e.milkRecordId) {
        try {
          const mr = await MilkRecord.findById(e.milkRecordId).select('fat lr snf totalTs').lean();
          if (mr) {
            fat     = Number(mr.fat)     || 0;
            lr      = Number(mr.lr)      || lr;
            snf     = Number(mr.snf)     || 0;
            totalTs = Number(mr.totalTs) || 0;
          }
        } catch (_) {}
      }

      return {
        _id: e._id,
        id:  e._id,
        date: e.date,
        type: 'Purchase',
        partyName: e.supplierName,
        vol:    (e.milkLiter || 0)   - (e.spoiledLiters || 0),
        amount: (e.totalAmount || 0) - (e.spoiledAmount || 0),
        fat,
        lr,
        snf,
        tsr:     fat + snf,
        totalTs,
        rate: e.rate || 0,
        pricePerLiter: e.rate || 0,
        advance: e.advanceAmount || 0,
        paid:    e.paymentReceived || 0,
        routeId:   e.routeId   || null,
        routeName: e.routeName || '',
      };
    }));
  }

  // ── Sale records — net of spoiled ──────────────────────────────────────────
  // FIX: Same as Purchase above — sirf non-manual (route/MilkSales se aayi)
  // entries milk records mein show karo. SaleLedger.tsx se manually add kari
  // amount-only entries ko getMilkRecords se exclude karo.
  if (!wantType || wantType === 'Sale') {
    const entries = await SaleLedger.find({
      ...saleFilter,
      isManual: false,  // Manual entries milk records mein nahi jaayengi
      $or: [
        { milkLiter: { $gt: 0 } },
        { totalAmount: { $gt: 0 } },
      ],
    }).sort({ date: -1, createdAt: -1 });
    saleRecords = await Promise.all(entries.map(async (e) => {
      let fat = e.fat || 0;
      let lr  = e.lr  || 0;
      let snf = e.snf || 0;
      let totalTs = e.totalTs || 0;

      // If fat/snf/totalTs are missing, look them up from linked MilkRecord
      if (!fat && !snf && !totalTs && e.milkRecordId) {
        try {
          const mr = await MilkRecord.findById(e.milkRecordId).select('fat lr snf totalTs').lean();
          if (mr) {
            fat     = Number(mr.fat)     || 0;
            lr      = Number(mr.lr)      || lr;
            snf     = Number(mr.snf)     || 0;
            totalTs = Number(mr.totalTs) || 0;
          }
        } catch (_) {}
      }

      return {
        _id: e._id,
        id:  e._id,
        date: e.date,
        type: 'Sale',
        partyName: e.customerName,
        // Sale ke liye spoiled minus NAHI — sale amount wahi hai jo customer ko charge hua
        // Spoiled loss already AccountRecord mein Expense ke tor pe record hai
        vol:    (e.milkLiter || 0),
        amount: (e.totalAmount || 0),
        fat,
        lr,
        snf,
        tsr:     fat + snf,
        totalTs,
        rate: e.rate || 0,
        pricePerLiter: e.rate || 0,
        advance: e.advanceAmount || 0,
        paid:    e.paymentReceived || 0,
        routeId:   null,
        routeName: '',
      };
    }));
  }

  const combined = [...purchaseRecords, ...saleRecords]
    .filter(r => (Number(r.vol) || 0) > 0 || (Number(r.amount) || 0) > 0)  // 0,0 entries hide karo
    .sort((a, b) => b.date.localeCompare(a.date));

  return ApiResponse.ok(combined).send(res);
});

/**
 * @route   POST /api/milk-records
 * @desc    Milk record add karo (Purchase ya Sale)
 * @access  Admin, Accountant, Driver
 * 
 * Purchase add karne par automatically PurchaseLedger mein bhi jayega
 * Sale add karne par automatically SaleLedger mein bhi jayega
 */
const createMilkRecord = asyncHandler(async (req, res) => {
  // vol = 0 wali entry MilkRecord mein save nahi hogi
  // (sirf amount/payment wali entries PurchaseLedger mein jaati hain)
  if ((Number(req.body.vol) || 0) <= 0) {
    return ApiResponse.ok(null, 'Skipped — zero volume entry does not create a milk record').send(res);
  }

  const record = await MilkRecord.create({
    ...req.body,
    createdBy: req.user._id,
  });

  // Auto-create ledger entry
  if (record.type === 'Purchase') {
    await _addToPurchaseLedger(record, req.user._id);
  } else if (record.type === 'Sale') {
    await _addToSaleLedger(record, req.user._id);
  }

  return ApiResponse.created(record, 'Milk record added').send(res);
});

/**
 * @route   POST /api/milk-records/bulk
 * @desc    Bulk milk records add karo (collection se ata hai)
 * @access  Admin, Driver
 */
const createBulkMilkRecords = asyncHandler(async (req, res) => {
  const { records, date, routeId } = req.body;

  if (!Array.isArray(records) || records.length === 0) {
    throw ApiError.badRequest('Records array is required');
  }

  // vol = 0 wali entries filter out karo — yeh sirf payment entries hain
  const validRecords = records.filter(r => (Number(r.vol) || 0) > 0);
  if (validRecords.length === 0) {
    return ApiResponse.ok([], 'Skipped — all records had zero volume').send(res);
  }

  // Existing records for this date+route delete karo (overwrite behavior)
  if (routeId) {
    await MilkRecord.deleteMany({ date, type: 'Purchase', routeId });
    await PurchaseLedger.deleteMany({ date, routeId });
  } else {
    // Manual entries (no routeId): same date+partyName+type ka duplicate avoid karo
    // Har incoming record ke liye purana record delete karo before insert
    const purchaseParties = validRecords
      .filter(r => r.type === 'Purchase')
      .map(r => r.partyName);
    const saleParties = validRecords
      .filter(r => r.type === 'Sale')
      .map(r => r.partyName);

    if (purchaseParties.length > 0) {
      const oldPurchases = await MilkRecord.find({
        date, type: 'Purchase', routeId: { $exists: false },
        partyName: { $in: purchaseParties },
      }).select('_id').lean();
      const oldIds = oldPurchases.map(r => r._id);
      if (oldIds.length > 0) {
        await MilkRecord.deleteMany({ _id: { $in: oldIds } });
        await PurchaseLedger.deleteMany({ milkRecordId: { $in: oldIds } });
      }
    }
    if (saleParties.length > 0) {
      const oldSales = await MilkRecord.find({
        date, type: 'Sale',
        partyName: { $in: saleParties },
      }).select('_id').lean();
      const oldIds = oldSales.map(r => r._id);
      if (oldIds.length > 0) {
        await MilkRecord.deleteMany({ _id: { $in: oldIds } });
        await SaleLedger.deleteMany({ milkRecordId: { $in: oldIds } });
      }
    }
  }

  const createdRecords = await MilkRecord.insertMany(
    validRecords.map((r) => ({ ...r, createdBy: req.user._id }))
  );

  // Purchase ledger entries
  const purchaseRecords = createdRecords.filter((r) => r.type === 'Purchase');
  for (const record of purchaseRecords) {
    await _addToPurchaseLedger(record, req.user._id);
  }

  // Sale ledger entries
  const saleRecords = createdRecords.filter((r) => r.type === 'Sale');
  for (const record of saleRecords) {
    await _addToSaleLedger(record, req.user._id);
  }

  return ApiResponse.created(createdRecords, `${createdRecords.length} records added`).send(res);
});

/**
 * @route   DELETE /api/milk-records/:id
 * @desc    Record delete karo — ID kisi bhi collection ka ho sakta hai:
 *          MilkRecord._id, PurchaseLedger._id, ya SaleLedger._id
 * @access  Admin
 */
const deleteMilkRecord = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // 1. Pehle MilkRecord se try karo
  const milkRecord = await MilkRecord.findByIdAndDelete(id).catch(() => null);
  if (milkRecord) {
    // Linked ledger entries cascade delete
    await PurchaseLedger.deleteOne({ milkRecordId: milkRecord._id });
    await SaleLedger.deleteOne({ milkRecordId: milkRecord._id });
    return ApiResponse.ok({ id }, 'Record deleted').send(res);
  }

  // 2. MilkRecord nahi mila — PurchaseLedger se try karo
  const purchaseLedger = await PurchaseLedger.findByIdAndDelete(id).catch(() => null);
  if (purchaseLedger) {
    // Linked MilkRecord bhi delete karo agar hai
    if (purchaseLedger.milkRecordId) {
      await MilkRecord.findByIdAndDelete(purchaseLedger.milkRecordId).catch(() => {});
    }
    return ApiResponse.ok({ id }, 'Purchase record deleted').send(res);
  }

  // 3. SaleLedger se try karo
  const saleLedger = await SaleLedger.findByIdAndDelete(id).catch(() => null);
  if (saleLedger) {
    // Linked MilkRecord bhi delete karo agar hai
    if (saleLedger.milkRecordId) {
      await MilkRecord.findByIdAndDelete(saleLedger.milkRecordId).catch(() => {});
    }
    return ApiResponse.ok({ id }, 'Sale record deleted').send(res);
  }

  // Kuch nahi mila
  throw ApiError.notFound('Record not found in any collection');
});

// ─── Private Helpers ─────────────────────────────────────────────────────────

const _addToPurchaseLedger = async (record, userId) => {
  // Supplier profile dhundo ya banao
  let supplier = await SupplierProfile.findOne({
    supplierName: { $regex: new RegExp(`^${record.partyName}$`, 'i') },
  });

  if (!supplier) {
    supplier = await SupplierProfile.create({
      supplierName: record.partyName,
    });
  }

  await PurchaseLedger.create({
    date: record.date,
    supplierProfileId: supplier._id,
    supplierName: supplier.supplierName,
    milkLiter: record.vol,
    fat: record.fat,
    lr: record.lr,
    snf: record.snf,
    totalTs: record.totalTs,
    rate: record.rate,
    totalAmount: record.amount,
    advanceAmount: record.advance || 0,
    paymentReceived: record.paid || 0,
    isManual: false,
    routeId: record.routeId,
    routeName: record.routeName,
    milkRecordId: record._id,
    createdBy: userId,
  });
};

const _addToSaleLedger = async (record, userId) => {
  // Customer profile dhundo ya banao
  let customer = await CustomerProfile.findOne({
    customerName: { $regex: new RegExp(`^${record.partyName}$`, 'i') },
  });

  if (!customer) {
    customer = await CustomerProfile.create({
      customerName: record.partyName,
    });
  }

  await SaleLedger.create({
    date: record.date,
    customerProfileId: customer._id,
    customerName: customer.customerName,
    milkLiter: record.vol,
    fat: record.fat,
    lr: record.lr,
    snf: record.snf,
    totalTs: record.totalTs,
    rate: record.rate,
    totalAmount: record.amount,
    advanceAmount: record.advance || 0,
    paymentReceived: record.paid || 0,
    notes: record.soldUnit === 'Kg' ? `Milk Sale (Kg) - ${record.soldQtyKg} Kg` : 'Milk Sale (Liters)',
    isManual: false,
    milkRecordId: record._id,
    createdBy: userId,
  });
};

module.exports = { getMilkRecords, createMilkRecord, createBulkMilkRecords, deleteMilkRecord };
