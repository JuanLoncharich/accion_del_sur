const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const shipmentController = require('../controllers/shipmentController');
const { authenticate } = require('../middleware/auth');

const idParam = param('id').isInt({ min: 1 }).withMessage('ID inválido');

router.get('/', authenticate, shipmentController.list);
router.get('/:id', authenticate, idParam, shipmentController.getById);
router.post('/', authenticate, [
  body('reception_center_id').isInt({ min: 1 }).withMessage('Centro de recepción inválido'),
  body('date').optional({ values: 'falsy' }).isISO8601().withMessage('Fecha inválida'),
  body('confirm').optional().isBoolean().withMessage('confirm debe ser booleano'),
  body('details').isArray({ min: 1 }).withMessage('El envío debe tener al menos un insumo'),
  body('details.*.supply_id').isInt({ min: 1 }).withMessage('Insumo inválido'),
  body('details.*.quantity_sent').isInt({ min: 1 }).withMessage('La cantidad debe ser un entero mayor a 0'),
], shipmentController.create);
router.post('/:id/confirm', authenticate, idParam, shipmentController.confirm);
router.delete('/:id', authenticate, idParam, shipmentController.remove);

module.exports = router;
