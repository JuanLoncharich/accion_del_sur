const express = require('express');
const router = express.Router();
const distributionController = require('../controllers/distributionController');
const { authenticate } = require('../middleware/auth');

// Solo lectura: vista de envíos confirmados con el formato que usa el Historial de transacciones.
// Para crear salidas de inventario se usa /api/shipments.
router.get('/stats', authenticate, distributionController.stats);
router.get('/', authenticate, distributionController.list);

module.exports = router;
