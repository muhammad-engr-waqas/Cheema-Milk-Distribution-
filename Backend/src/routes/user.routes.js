const express = require('express');
const { body } = require('express-validator');
const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  toggleUserStatus,
} = require('../controllers/user.controller');
const { protect } = require('../middleware/auth.middleware');
const { authorize } = require('../middleware/role.middleware');
const { validate } = require('../middleware/validate.middleware');

const router = express.Router();

// Sab routes protected (login required)
router.use(protect);

// GET routes: koi bhi logged-in user (Accountant, MilkTester, etc.) — driver/tester
// names lookup ke liye zaroori hai in dropdowns aur reports mein.
router.get('/', getUsers);
router.get('/:id', getUserById);

// Baaki sab (create/update/delete/toggle) sirf Admin ke liye
router.use(authorize('Admin'));

router.post(
  '/',
  [
    body('fullName').notEmpty().withMessage('Full name is required'),
    body('username').notEmpty().withMessage('Username is required'),
    body('password')
      .if(body('role').not().equals('Driver'))
      .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').isIn(['Admin', 'MilkTester', 'Accountant', 'Driver']).withMessage('Invalid role'),
  ],
  validate,
  createUser
);

router.put('/:id', updateUser);
router.delete('/:id', deleteUser);
router.patch('/:id/toggle-status', toggleUserStatus);

module.exports = router;
