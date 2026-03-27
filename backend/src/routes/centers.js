const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const centerController = require('../controllers/centerController');

router.get('/', authenticate, centerController.list);
router.get('/:id', authenticate, centerController.getById);
router.post('/', authenticate, centerController.create);
router.delete('/:id', authenticate, centerController.deactivate);
router.get('/:id/inventory', authenticate, centerController.getInventory);

module.exports = router;
