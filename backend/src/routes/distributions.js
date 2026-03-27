const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const distributionController = require('../controllers/distributionController');
const { authenticate } = require('../middleware/auth');

router.get('/stats', authenticate, distributionController.stats);
router.get('/', authenticate, distributionController.list);
router.post('/prepare', authenticate, [
  body('item_id').isInt().withMessage('Ítem inválido'),
  body('quantity').isInt({ min: 1 }).withMessage('Cantidad debe ser mayor a 0'),
  body('center_id').isInt({ min: 1 }).withMessage('center_id inválido'),
  body('center_name').optional().isString().isLength({ max: 120 }),
  body('center_latitude').optional().isFloat({ min: -90, max: 90 }),
  body('center_longitude').optional().isFloat({ min: -180, max: 180 }),
], distributionController.prepare);

router.post('/:id/identify-manual', authenticate, [
  body('receiver_identifier').notEmpty().withMessage('DNI/identificador manual requerido'),
  body('receiver_identifier').isLength({ min: 6, max: 20 }).withMessage('DNI inválido'),
  body('doc_type').optional().isIn(['DNI']),
], distributionController.identifyManual);

router.post('/:id/sign', authenticate, [
  body('signature_data').notEmpty().withMessage('Firma manuscrita requerida'),
], distributionController.sign);

router.post('/:id/finalize', authenticate, distributionController.finalize);

// Compatibilidad con clientes anteriores: crea borrador, no finaliza.
router.post('/', authenticate, [
  body('item_id').isInt().withMessage('Ítem inválido'),
  body('quantity').isInt({ min: 1 }).withMessage('Cantidad debe ser mayor a 0'),
  body('center_id').isInt({ min: 1 }).withMessage('center_id inválido'),
  body('center_name').optional().isString().isLength({ max: 120 }),
  body('center_latitude').optional().isFloat({ min: -90, max: 90 }),
  body('center_longitude').optional().isFloat({ min: -180, max: 180 }),
], distributionController.create);

module.exports = router;
