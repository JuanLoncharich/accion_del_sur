const express = require('express');
const router = express.Router();
const landingController = require('../controllers/landingController');
const { publicRateLimit } = require('../middleware/publicRateLimit');

// Públicas (landing): datos agregados y movimientos de inventario anclados, sin datos personales.
router.get('/summary', publicRateLimit, landingController.summary);
router.get('/centers-ranking', publicRateLimit, landingController.centersRanking);
router.get('/recent-movements', publicRateLimit, landingController.recentMovements);

module.exports = router;
