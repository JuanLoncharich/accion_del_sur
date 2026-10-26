const express = require('express');
const router = express.Router();
const supportPanelController = require('../controllers/supportPanelController');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, supportPanelController.get);

module.exports = router;
