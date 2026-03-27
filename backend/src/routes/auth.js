const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.post('/login', [
  body('username').notEmpty().withMessage('Usuario requerido'),
  body('password').notEmpty().withMessage('Contraseña requerida'),
], authController.login);

router.get('/me', authenticate, authController.me);

router.post('/register', authenticate, requireAdmin, [
  body('username').notEmpty().withMessage('Usuario requerido'),
  body('email').isEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
  body('role').optional().isIn(['admin', 'logistica']).withMessage('Rol inválido'),
], authController.register);

module.exports = router;
