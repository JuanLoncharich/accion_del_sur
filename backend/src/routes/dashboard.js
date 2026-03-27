const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/auth');

router.get('/summary', authenticate, dashboardController.summary);

module.exports = router;
