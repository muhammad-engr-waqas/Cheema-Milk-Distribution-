/**
 * Test Data Seed Script
 * Run: node seedTestData.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User = require('./src/models/User');
const Route = require('./src/models/Route');
const Vehicle = require('./src/models/Vehicle');
const SupplierProfile = require('./src/models/SupplierProfile');
const CustomerProfile = require('./src/models/CustomerProfile');
const MilkRecord = require('./src/models/MilkRecord');
const PurchaseLedger = require('./src/models/PurchaseLedger');
const SaleLedger = require('./src/models/SaleLedger');
const AdvanceTransaction = require('./src/models/AdvanceTransaction');
const LabReport = require('./src/models/LabReport');
const Dispatch = require('./src/models/Dispatch');

const today = new Date();
const d = (offset = 0) => {
  const dt = new Date(today);
  dt.setDate(dt.getDate() - offset);
  return dt.toISOString().split('T')[0];
};

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✓ MongoDB Connected');

  // ── 1. USERS ─────────────────────────────────────────────────────────────
  console.log('\n👥 Users ban rahe hain...');
  await User.deleteMany({ username: { $ne: 'admin' } });

  const milkTester1 = await new User({
    fullName: 'Usman Ghani', username: 'usman', password: 'usman123',
    phone: '03001234567', role: 'MilkTester', status: 'Active'
  }).save();

  const milkTester2 = await new User({
    fullName: 'Bilal Ahmed', username: 'bilal', password: 'bilal123',
    phone: '03011234567', role: 'MilkTester', status: 'Active'
  }).save();

  const accountant = await new User({
    fullName: 'Rizwan Khan', username: 'rizwan', password: 'rizwan123',
    phone: '03021234567', role: 'Accountant', status: 'Active'
  }).save();

  const driver1 = await new User({
    fullName: 'Arshad Ali', username: 'arshad', password: 'arshad123',
    phone: '03031234567', role: 'Driver', status: 'Active'
  }).save();

  const driver2 = await new User({
    fullName: 'Jameel Hussain', username: 'jameel', password: 'jameel123',
    phone: '03041234567', role: 'Driver', status: 'Active'
  }).save();

  const admin = await User.findOne({ username: 'admin' });
  console.log('✓ 5 users bane (MilkTester x2, Accountant, Driver x2)');

  // ── 2. ROUTES ─────────────────────────────────────────────────────────────
  console.log('\n🗺️  Routes ban rahe hain...');
  await Route.deleteMany({});

  const route1 = await Route.create({
    name: 'Lahore Route A', length: '45 km', travelTime: '1.5 hrs', cost: 2500,
    tankerNumber: 'T-101', mtName: 'Usman Ghani',
    stops: [{ name: 'Shahdara' }, { name: 'Badami Bagh' }, { name: 'Data Darbar' }, { name: 'Gulberg' }],
    assignedMilkTesterIds: [milkTester1._id], createdBy: admin._id,
  });

  const route2 = await Route.create({
    name: 'Lahore Route B', length: '60 km', travelTime: '2 hrs', cost: 3200,
    tankerNumber: 'T-102', mtName: 'Bilal Ahmed',
    stops: [{ name: 'Johar Town' }, { name: 'Model Town' }, { name: 'Wapda Town' }, { name: 'DHA Phase 5' }],
    assignedMilkTesterIds: [milkTester2._id], createdBy: admin._id,
  });

  const route3 = await Route.create({
    name: 'Sheikhupura Route', length: '35 km', travelTime: '1 hr', cost: 1800,
    tankerNumber: 'T-103', mtName: 'Bilal Ahmed',
    stops: [{ name: 'Muridke' }, { name: 'Ferozewala' }, { name: 'Sheikhupura City' }],
    assignedMilkTesterIds: [milkTester1._id, milkTester2._id], createdBy: admin._id,
  });
  console.log('✓ 3 routes bane');

  // ── 3. VEHICLES ───────────────────────────────────────────────────────────
  console.log('\n🚛 Vehicles ban rahe hain...');
  await Vehicle.deleteMany({});

  const vehicle1 = await Vehicle.create({
    vehicleNumber: 'LHR-1234', name: 'Isuzu Tanker 1',
    driverId: driver1._id, driverName: 'Arshad Ali', driverPhone: '03031234567',
    status: 'Available', routeInfo: 'Lahore Route A',
  });

  const vehicle2 = await Vehicle.create({
    vehicleNumber: 'LHR-5678', name: 'Isuzu Tanker 2',
    driverId: driver2._id, driverName: 'Jameel Hussain', driverPhone: '03041234567',
    status: 'Available', routeInfo: 'Lahore Route B',
  });

  const vehicle3 = await Vehicle.create({
    vehicleNumber: 'SKP-9999', name: 'Mini Tanker',
    driverName: 'Muhammad Akram', driverPhone: '03051234567',
    status: 'On Route', routeInfo: 'Sheikhupura Route',
  });
  console.log('✓ 3 vehicles bane');

  // ── 4. SUPPLIER PROFILES ──────────────────────────────────────────────────
  console.log('\n🏭 Suppliers ban rahe hain...');
  await SupplierProfile.deleteMany({});

  const sup1 = await SupplierProfile.create({
    supplierName: 'Muhammad Aslam Farm', phoneNumber: '03061234567',
    location: 'Sheikhupura', openingBalance: 15000,
    driverId: driver1._id, driverName: 'Arshad Ali',
    transportRelation: 'Empty Driver', areaLocation: 'Sheikhupura Road',
  });
  const sup2 = await SupplierProfile.create({
    supplierName: 'Cheema Dairy Farm', phoneNumber: '03071234567',
    location: 'Muridke', openingBalance: 8500,
    driverName: 'Direct', transportRelation: 'Direct Self',
    areaLocation: 'Muridke Bypass',
  });
  const sup3 = await SupplierProfile.create({
    supplierName: 'Al-Rehman Cattle', phoneNumber: '03081234567',
    location: 'Ferozewala', openingBalance: 22000,
    driverId: driver2._id, driverName: 'Jameel Hussain',
    transportRelation: 'Empty Driver', areaLocation: 'GT Road Ferozewala',
  });
  const sup4 = await SupplierProfile.create({
    supplierName: 'Malik Brothers Farm', phoneNumber: '03091234567',
    location: 'Gujranwala', openingBalance: 5000,
    driverName: 'Direct', transportRelation: 'Direct Self',
    areaLocation: 'Gujranwala City',
  });
  console.log('✓ 4 suppliers bane');

  // ── 5. CUSTOMER PROFILES ──────────────────────────────────────────────────
  console.log('\n🛒 Customers ban rahe hain...');
  await CustomerProfile.deleteMany({});

  const cust1 = await CustomerProfile.create({
    customerName: 'Shezan Dairy', phoneNumber: '04211234567',
    location: 'Lahore', openingBalance: 35000,
    driverId: driver1._id, driverName: 'Arshad Ali',
    deliveryType: 'Driver Delivery', whatsappName: 'Shezan Manager',
  });
  const cust2 = await CustomerProfile.create({
    customerName: 'Pakola Foods', phoneNumber: '04221234567',
    location: 'Lahore Industrial', openingBalance: 12000,
    driverName: 'Direct', deliveryType: 'Direct Self',
    whatsappName: 'Pakola Purchase',
  });
  const cust3 = await CustomerProfile.create({
    customerName: 'Haleeb Foods', phoneNumber: '04231234567',
    location: 'Lahore Kot Lakhpat', openingBalance: 50000,
    driverId: driver2._id, driverName: 'Jameel Hussain',
    deliveryType: 'Driver Delivery', whatsappName: 'Haleeb Team',
  });
  const cust4 = await CustomerProfile.create({
    customerName: 'Nestle Pakistan', phoneNumber: '04241234567',
    location: 'Sheikhupura Industrial', openingBalance: 75000,
    driverName: 'Direct', deliveryType: 'Direct Self',
    whatsappName: 'Nestle Supply Chain',
  });
  console.log('✓ 4 customers bane');

  // ── 6. MILK RECORDS (Purchase & Sale) ────────────────────────────────────
  console.log('\n🥛 Milk Records ban rahe hain...');
  await MilkRecord.deleteMany({});

  const purchaseMilkData = [
    { date: d(0), partyName: 'Muhammad Aslam Farm', vol: 850, fat: 4.2, lr: 28.5, snf: 8.9, rate: 95, amount: 80750 },
    { date: d(0), partyName: 'Cheema Dairy Farm',   vol: 620, fat: 3.8, lr: 27.2, snf: 8.5, rate: 90, amount: 55800 },
    { date: d(1), partyName: 'Al-Rehman Cattle',    vol: 1100, fat: 4.5, lr: 29.0, snf: 9.1, rate: 98, amount: 107800 },
    { date: d(1), partyName: 'Malik Brothers Farm', vol: 450, fat: 3.6, lr: 26.8, snf: 8.2, rate: 88, amount: 39600 },
    { date: d(2), partyName: 'Muhammad Aslam Farm', vol: 920, fat: 4.1, lr: 28.1, snf: 8.8, rate: 94, amount: 86480 },
    { date: d(2), partyName: 'Cheema Dairy Farm',   vol: 580, fat: 3.9, lr: 27.5, snf: 8.6, rate: 92, amount: 53360 },
    { date: d(3), partyName: 'Al-Rehman Cattle',    vol: 980, fat: 4.3, lr: 28.7, snf: 9.0, rate: 96, amount: 94080 },
    { date: d(4), partyName: 'Malik Brothers Farm', vol: 510, fat: 3.7, lr: 27.0, snf: 8.3, rate: 89, amount: 45390 },
    { date: d(5), partyName: 'Muhammad Aslam Farm', vol: 870, fat: 4.0, lr: 27.9, snf: 8.7, rate: 93, amount: 80910 },
    { date: d(6), partyName: 'Cheema Dairy Farm',   vol: 640, fat: 3.8, lr: 27.3, snf: 8.5, rate: 91, amount: 58240 },
  ];

  const saleMilkData = [
    { date: d(0), partyName: 'Shezan Dairy',    vol: 750, fat: 4.0, lr: 28.0, rate: 110, amount: 82500 },
    { date: d(0), partyName: 'Pakola Foods',    vol: 400, fat: 3.8, lr: 27.0, rate: 105, amount: 42000 },
    { date: d(1), partyName: 'Haleeb Foods',    vol: 900, fat: 4.2, lr: 28.5, rate: 115, amount: 103500 },
    { date: d(1), partyName: 'Nestle Pakistan', vol: 600, fat: 4.0, lr: 28.0, rate: 112, amount: 67200 },
    { date: d(2), partyName: 'Shezan Dairy',    vol: 820, fat: 4.1, lr: 28.2, rate: 111, amount: 91020 },
    { date: d(3), partyName: 'Pakola Foods',    vol: 350, fat: 3.7, lr: 26.8, rate: 104, amount: 36400 },
    { date: d(4), partyName: 'Haleeb Foods',    vol: 950, fat: 4.3, lr: 28.8, rate: 116, amount: 110200 },
    { date: d(5), partyName: 'Nestle Pakistan', vol: 700, fat: 4.1, lr: 28.3, rate: 113, amount: 79100 },
    { date: d(6), partyName: 'Shezan Dairy',    vol: 800, fat: 4.0, lr: 28.0, rate: 110, amount: 88000 },
  ];

  for (const r of purchaseMilkData) {
    await MilkRecord.create({ ...r, type: 'Purchase', routeId: route1._id, routeName: route1.name, createdBy: admin._id });
  }
  for (const r of saleMilkData) {
    await MilkRecord.create({ ...r, type: 'Sale', createdBy: admin._id });
  }
  console.log(`✓ ${purchaseMilkData.length} Purchase + ${saleMilkData.length} Sale milk records bane`);

  // ── 7. PURCHASE LEDGER ───────────────────────────────────────────────────
  console.log('\n📒 Purchase Ledger ban raha hai...');
  await PurchaseLedger.deleteMany({});

  const purchaseLedgerData = [
    { date: d(0), supplierName: 'Muhammad Aslam Farm', supplierProfileId: sup1._id, milkUnit: 'Liters', milkLiter: 850, fat: 4.2, lr: 28.5, snf: 8.9, rate: 95, totalAmount: 80750, paymentReceived: 60000, remainingBalance: 20750, paymentType: 'Cash' },
    { date: d(0), supplierName: 'Cheema Dairy Farm',   supplierProfileId: sup2._id, milkUnit: 'Liters', milkLiter: 620, fat: 3.8, lr: 27.2, snf: 8.5, rate: 90, totalAmount: 55800, paymentReceived: 55800, remainingBalance: 0,     paymentType: 'Bank Transfer', bankName: 'Meezan' },
    { date: d(1), supplierName: 'Al-Rehman Cattle',    supplierProfileId: sup3._id, milkUnit: 'Liters', milkLiter: 1100, fat: 4.5, lr: 29.0, snf: 9.1, rate: 98, totalAmount: 107800, paymentReceived: 80000, remainingBalance: 27800, paymentType: 'Cash' },
    { date: d(1), supplierName: 'Malik Brothers Farm', supplierProfileId: sup4._id, milkUnit: 'Liters', milkLiter: 450, fat: 3.6, lr: 26.8, snf: 8.2, rate: 88, totalAmount: 39600, paymentReceived: 39600, remainingBalance: 0,     paymentType: 'JazzCash' },
    { date: d(2), supplierName: 'Muhammad Aslam Farm', supplierProfileId: sup1._id, milkUnit: 'Liters', milkLiter: 920, fat: 4.1, lr: 28.1, snf: 8.8, rate: 94, totalAmount: 86480, paymentReceived: 50000, remainingBalance: 36480, paymentType: 'Cash' },
    { date: d(3), supplierName: 'Al-Rehman Cattle',    supplierProfileId: sup3._id, milkUnit: 'Liters', milkLiter: 980, fat: 4.3, lr: 28.7, snf: 9.0, rate: 96, totalAmount: 94080, paymentReceived: 94080, remainingBalance: 0,     paymentType: 'Bank Transfer', bankName: 'HBL' },
    { date: d(4), supplierName: 'Cheema Dairy Farm',   supplierProfileId: sup2._id, milkUnit: 'Liters', milkLiter: 580, fat: 3.9, lr: 27.5, snf: 8.6, rate: 92, totalAmount: 53360, paymentReceived: 30000, remainingBalance: 23360, paymentType: 'Cash' },
    { date: d(5), supplierName: 'Malik Brothers Farm', supplierProfileId: sup4._id, milkUnit: 'Liters', milkLiter: 510, fat: 3.7, lr: 27.0, snf: 8.3, rate: 89, totalAmount: 45390, paymentReceived: 45390, remainingBalance: 0,     paymentType: 'EasyPaisa' },
    { date: d(6), supplierName: 'Muhammad Aslam Farm', supplierProfileId: sup1._id, milkUnit: 'Liters', milkLiter: 870, fat: 4.0, lr: 27.9, snf: 8.7, rate: 93, totalAmount: 80910, paymentReceived: 70000, remainingBalance: 10910, paymentType: 'Cash' },
  ];

  for (const entry of purchaseLedgerData) {
    await PurchaseLedger.create({ ...entry, time: '09:30', routeId: route1._id, routeName: route1.name, createdBy: admin._id });
  }
  console.log(`✓ ${purchaseLedgerData.length} purchase ledger entries bani`);

  // ── 8. SALE LEDGER ───────────────────────────────────────────────────────
  console.log('\n📗 Sale Ledger ban raha hai...');
  await SaleLedger.deleteMany({});

  const saleLedgerData = [
    { date: d(0), customerName: 'Shezan Dairy',    customerProfileId: cust1._id, milkUnit: 'Liters', milkLiter: 750, fat: 4.0, lr: 28.0, rate: 110, totalAmount: 82500, paymentReceived: 82500, remainingBalance: 0,     paymentType: 'Bank Transfer', bankName: 'UBL' },
    { date: d(0), customerName: 'Pakola Foods',    customerProfileId: cust2._id, milkUnit: 'Liters', milkLiter: 400, fat: 3.8, lr: 27.0, rate: 105, totalAmount: 42000, paymentReceived: 30000, remainingBalance: 12000, paymentType: 'Cash' },
    { date: d(1), customerName: 'Haleeb Foods',    customerProfileId: cust3._id, milkUnit: 'Liters', milkLiter: 900, fat: 4.2, lr: 28.5, rate: 115, totalAmount: 103500, paymentReceived: 103500, remainingBalance: 0,   paymentType: 'Bank Transfer', bankName: 'Meezan' },
    { date: d(1), customerName: 'Nestle Pakistan', customerProfileId: cust4._id, milkUnit: 'Liters', milkLiter: 600, fat: 4.0, lr: 28.0, rate: 112, totalAmount: 67200, paymentReceived: 50000, remainingBalance: 17200, paymentType: 'Cash' },
    { date: d(2), customerName: 'Shezan Dairy',    customerProfileId: cust1._id, milkUnit: 'Liters', milkLiter: 820, fat: 4.1, lr: 28.2, rate: 111, totalAmount: 91020, paymentReceived: 91020, remainingBalance: 0,     paymentType: 'Bank Transfer', bankName: 'HBL' },
    { date: d(3), customerName: 'Pakola Foods',    customerProfileId: cust2._id, milkUnit: 'Liters', milkLiter: 350, fat: 3.7, lr: 26.8, rate: 104, totalAmount: 36400, paymentReceived: 36400, remainingBalance: 0,     paymentType: 'JazzCash' },
    { date: d(4), customerName: 'Haleeb Foods',    customerProfileId: cust3._id, milkUnit: 'Liters', milkLiter: 950, fat: 4.3, lr: 28.8, rate: 116, totalAmount: 110200, paymentReceived: 80000, remainingBalance: 30200, paymentType: 'Cash' },
    { date: d(5), customerName: 'Nestle Pakistan', customerProfileId: cust4._id, milkUnit: 'Liters', milkLiter: 700, fat: 4.1, lr: 28.3, rate: 113, totalAmount: 79100, paymentReceived: 79100, remainingBalance: 0,     paymentType: 'Bank Transfer', bankName: 'Alfalah' },
    { date: d(6), customerName: 'Shezan Dairy',    customerProfileId: cust1._id, milkUnit: 'Liters', milkLiter: 800, fat: 4.0, lr: 28.0, rate: 110, totalAmount: 88000, paymentReceived: 60000, remainingBalance: 28000, paymentType: 'Cash' },
  ];

  for (const entry of saleLedgerData) {
    await SaleLedger.create({ ...entry, time: '10:00', createdBy: admin._id });
  }
  console.log(`✓ ${saleLedgerData.length} sale ledger entries bani`);

  // ── 9. ADVANCE TRANSACTIONS ───────────────────────────────────────────────
  console.log('\n💰 Advance Transactions ban rahe hain...');
  await AdvanceTransaction.deleteMany({});

  await AdvanceTransaction.create([
    { driverId: driver1._id, driverName: 'Arshad Ali', type: 'ADVANCE', date: d(0), amount: 5000, category: 'Advance Received', description: 'Monthly advance payment', paymentMethod: 'Cash', createdBy: admin._id },
    { driverId: driver1._id, driverName: 'Arshad Ali', type: 'EXPENSE', date: d(1), amount: 1200, category: 'Fuel', description: 'Lahore Route A fuel kharch', paymentMethod: 'Cash', createdBy: admin._id },
    { driverId: driver1._id, driverName: 'Arshad Ali', type: 'EXPENSE', date: d(2), amount: 350, category: 'Toll Plaza', description: 'Toll plaza charges', paymentMethod: 'Cash', createdBy: admin._id },
    { driverId: driver1._id, driverName: 'Arshad Ali', type: 'TRIP_INCOME', date: d(3), amount: 8000, category: 'Trip Income', description: 'Route A trip income', paymentMethod: 'Cash', createdBy: admin._id },
    { driverId: driver2._id, driverName: 'Jameel Hussain', type: 'ADVANCE', date: d(0), amount: 7000, category: 'Advance Received', description: 'Emergency advance', paymentMethod: 'Bank Transfer', createdBy: admin._id },
    { driverId: driver2._id, driverName: 'Jameel Hussain', type: 'EXPENSE', date: d(1), amount: 1800, category: 'Fuel', description: 'Lahore Route B fuel', paymentMethod: 'Cash', createdBy: admin._id },
    { driverId: driver2._id, driverName: 'Jameel Hussain', type: 'EXPENSE', date: d(2), amount: 2500, category: 'Repair', description: 'Tyre puncture repair', paymentMethod: 'Cash', createdBy: admin._id },
    { driverId: driver2._id, driverName: 'Jameel Hussain', type: 'CASH_RETURN', date: d(4), amount: 3000, category: 'Cash Return', description: 'Partial advance return', paymentMethod: 'Cash', returnedByName: 'Jameel Hussain', createdBy: admin._id },
    { driverId: driver1._id, driverName: 'Arshad Ali', type: 'EXPENSE', date: d(5), amount: 450, category: 'Food', description: 'Driver ka khaana', paymentMethod: 'Cash', createdBy: admin._id },
    { driverId: driver2._id, driverName: 'Jameel Hussain', type: 'TRIP_INCOME', date: d(6), amount: 9500, category: 'Trip Income', description: 'Route B trip income', paymentMethod: 'Cash', createdBy: admin._id },
  ]);
  console.log('✓ 10 advance transactions bane');

  // ── 10. LAB REPORTS ───────────────────────────────────────────────────────
  console.log('\n🔬 Lab Reports ban rahe hain...');
  await LabReport.deleteMany({});

  await LabReport.create([
    { batchNo: 'LR-2024-001', technician: 'Usman Ghani', supplierName: 'Muhammad Aslam Farm', quantity: 850, fat: 4.2, snf: 8.9, lr: 28.5, ts: 13.1, totalTs: 11.14, pricePerLiter: 95, totalPayable: 80750, result: 'Pass', date: d(0), time: '07:30', createdBy: milkTester1._id },
    { batchNo: 'LR-2024-002', technician: 'Bilal Ahmed',  supplierName: 'Cheema Dairy Farm',   quantity: 620, fat: 3.8, snf: 8.5, lr: 27.2, ts: 12.3, totalTs: 10.46, pricePerLiter: 90, totalPayable: 55800, result: 'Pass', date: d(0), time: '08:15', createdBy: milkTester2._id },
    { batchNo: 'LR-2024-003', technician: 'Usman Ghani', supplierName: 'Al-Rehman Cattle',    quantity: 1100, fat: 4.5, snf: 9.1, lr: 29.0, ts: 13.6, totalTs: 11.56, pricePerLiter: 98, totalPayable: 107800, result: 'Pass', date: d(1), time: '07:00', createdBy: milkTester1._id },
    { batchNo: 'LR-2024-004', technician: 'Bilal Ahmed',  supplierName: 'Malik Brothers Farm', quantity: 450, fat: 3.5, snf: 8.0, lr: 26.5, ts: 11.5, totalTs: 9.78, pricePerLiter: 85, totalPayable: 38250, result: 'Fail', date: d(1), time: '09:00', createdBy: milkTester2._id },
    { batchNo: 'LR-2024-005', technician: 'Usman Ghani', supplierName: 'Muhammad Aslam Farm', quantity: 920, fat: 4.1, snf: 8.8, lr: 28.1, ts: 12.9, totalTs: 10.97, pricePerLiter: 94, totalPayable: 86480, result: 'Pass', date: d(2), time: '07:45', createdBy: milkTester1._id },
    { batchNo: 'LR-2024-006', technician: 'Bilal Ahmed',  supplierName: 'Al-Rehman Cattle',    quantity: 980, fat: 4.3, snf: 9.0, lr: 28.7, ts: 13.3, totalTs: 11.31, pricePerLiter: 96, totalPayable: 94080, result: 'Pass', date: d(3), time: '08:30', createdBy: milkTester2._id },
    { batchNo: 'LR-2024-007', technician: 'Usman Ghani', supplierName: 'Cheema Dairy Farm',   quantity: 580, fat: 3.9, snf: 8.6, lr: 27.5, ts: 12.5, totalTs: 10.63, pricePerLiter: 92, totalPayable: 53360, result: 'Pass', date: d(4), time: '07:20', createdBy: milkTester1._id },
  ]);
  console.log('✓ 7 lab reports bane');

  // ── 11. DISPATCHES ────────────────────────────────────────────────────────
  console.log('\n🚚 Dispatches ban rahe hain...');
  await Dispatch.deleteMany({});

  await Dispatch.create([
    {
      date: d(0), time: '06:30', vehicleNumber: 'LHR-1234', vehicleId: vehicle1._id,
      driverName: 'Arshad Ali', driverId: driver1._id, driverPhone: '03031234567',
      roadName: 'GT Road', liters: 850, destination: 'Shezan Dairy Lahore',
      status: 'Completed', fat: 4.2, lr: 28.5, price: 110,
      isSold: true, soldDate: d(0), createdBy: admin._id,
    },
    {
      date: d(0), time: '07:00', vehicleNumber: 'LHR-5678', vehicleId: vehicle2._id,
      driverName: 'Jameel Hussain', driverId: driver2._id, driverPhone: '03041234567',
      roadName: 'Canal Road', liters: 620, destination: 'Haleeb Foods Lahore',
      status: 'Received', fat: 3.8, lr: 27.2, price: 115,
      isSold: true, soldDate: d(0), createdBy: admin._id,
    },
    {
      date: d(1), time: '06:00', vehicleNumber: 'LHR-1234', vehicleId: vehicle1._id,
      driverName: 'Arshad Ali', driverId: driver1._id, driverPhone: '03031234567',
      roadName: 'Ferozepur Road', liters: 1100, destination: 'Nestle Pakistan Sheikhupura',
      status: 'Completed', fat: 4.5, lr: 29.0, price: 112,
      isSold: true, soldDate: d(1), createdBy: admin._id,
    },
    {
      date: d(2), time: '06:45', vehicleNumber: 'SKP-9999', vehicleId: vehicle3._id,
      driverName: 'Muhammad Akram', driverPhone: '03051234567',
      roadName: 'Sheikhupura Road', liters: 450, destination: 'Pakola Foods',
      status: 'On Route', fat: 3.6, lr: 26.8, price: 105,
      isSold: false, createdBy: admin._id,
    },
    {
      date: d(3), time: '07:30', vehicleNumber: 'LHR-5678', vehicleId: vehicle2._id,
      driverName: 'Jameel Hussain', driverId: driver2._id, driverPhone: '03041234567',
      roadName: 'Defence Road', liters: 780, destination: 'Haleeb Foods Lahore',
      status: 'Pending', fat: 4.1, lr: 28.3, price: 115,
      isSold: false, createdBy: admin._id,
    },
  ]);
  console.log('✓ 5 dispatches bane');

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(55));
  console.log('✅ TEST DATA SEED COMPLETE!');
  console.log('='.repeat(55));
  console.log('👥 Users     : admin, usman, bilal, rizwan, arshad, jameel');
  console.log('🗺️  Routes    : 3 (Lahore A, Lahore B, Sheikhupura)');
  console.log('🚛 Vehicles  : 3 (LHR-1234, LHR-5678, SKP-9999)');
  console.log('🏭 Suppliers : 4');
  console.log('🛒 Customers : 4');
  console.log('🥛 MilkRec   : 10 Purchase + 9 Sale = 19 records');
  console.log('📒 PurchLedg : 9 entries');
  console.log('📗 SaleLedg  : 9 entries');
  console.log('💰 Advances  : 10 transactions');
  console.log('🔬 LabReport : 7 reports');
  console.log('🚚 Dispatch  : 5 records');
  console.log('='.repeat(55));
  console.log('\n🔑 Login:');
  console.log('  Admin      → username: admin    | password: admin123');
  console.log('  Accountant → username: rizwan   | password: rizwan123');
  console.log('  MilkTester → username: usman    | password: usman123');
  console.log('  MilkTester → username: bilal    | password: bilal123');

  await mongoose.disconnect();
}

seed().catch(err => { console.error('❌ Error:', err.message); process.exit(1); });
