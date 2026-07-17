const express = require('express');
const {
  getAccountRecords,
  createAccountRecord,
  updateAccountRecord,
  deleteAccountRecord,
  getFinancialSummary,
} = require('../controllers/account.controller');
const { protect } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');

const router = express.Router();

router.use(protect, authorize('Admin', 'Accountant'));

router.get('/', getAccountRecords);
router.get('/summary', getFinancialSummary);
router.post('/', createAccountRecord);
router.put('/:id', updateAccountRecord);
router.delete('/:id', deleteAccountRecord);

module.exports = router;
