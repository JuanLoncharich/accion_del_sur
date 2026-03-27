const express = require('express');
const router = express.Router();
const landingController = require('../controllers/landingController');

router.get('/summary', landingController.summary);
router.get('/centers-ranking', landingController.centersRanking);
router.get('/recent-movements', landingController.recentMovements);

module.exports = router;
