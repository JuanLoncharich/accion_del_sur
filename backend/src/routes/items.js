const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const itemController = require('../controllers/itemController');
const { Item } = require('../models');
const { authenticate } = require('../middleware/auth');

router.get('/export/csv', authenticate, itemController.exportCSV);
router.get('/stock-by-category', authenticate, itemController.stockByCategory);
router.get('/', authenticate, [
  query('status').optional({ values: 'falsy' }).isIn(Item.STATUSES).withMessage('Estado inválido'),
], itemController.list);
router.get('/:id/trazabilidad', authenticate, [param('id').isInt({ min: 1 })], itemController.trazabilidad);
router.get('/:id', authenticate, itemController.getOne);
router.put('/:id', authenticate, itemController.update);
router.patch('/:id/status', authenticate, [
  param('id').isInt({ min: 1 }).withMessage('ID inválido'),
  body('status').isIn(Item.STATUSES).withMessage(`Estado inválido. Valores permitidos: ${Item.STATUSES.join(', ')}`),
], itemController.updateStatus);
router.delete('/:id', authenticate, itemController.deactivate);

module.exports = router;
