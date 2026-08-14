const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const donorController = require('../controllers/donorController');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, donorController.list);
router.post('/', authenticate, [
  body('name').notEmpty().withMessage('Nombre requerido'),
  body('contact').notEmpty().withMessage('Contacto requerido'),
], donorController.create);

module.exports = router;
