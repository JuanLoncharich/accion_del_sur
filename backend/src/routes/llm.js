const express = require('express');
const router = express.Router();

const llmController = require('../controllers/llmController');
const { authenticate } = require('../middleware/auth');

router.post('/query', authenticate, llmController.query);

module.exports = router;
