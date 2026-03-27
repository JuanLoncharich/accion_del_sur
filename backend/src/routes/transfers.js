const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const transferController = require('../controllers/transferController');

router.get('/', authenticate, transferController.list);
router.get('/:id', authenticate, transferController.getById);
router.post('/', authenticate, transferController.create);

module.exports = router;
