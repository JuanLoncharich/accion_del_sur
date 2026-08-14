const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const userController = require('../controllers/userController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.get('/', authenticate, requireAdmin, userController.list);
router.post('/', authenticate, requireAdmin, [
  body('email').isEmail(),
  body('password').isLength({ min: 6 }),
  body('role').optional().isIn(['VOLUNTARIO', 'ADMINISTRADOR']),
], userController.create);
router.put('/:id', authenticate, requireAdmin, userController.update);
router.delete('/:id', authenticate, requireAdmin, userController.remove);

module.exports = router;
