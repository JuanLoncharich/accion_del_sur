const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const centerController = require('../controllers/centerController');

router.get('/', authenticate, centerController.list);
router.get('/:id', authenticate, centerController.getById);
router.post('/', authenticate, requireAdmin, centerController.create);
router.put('/:id', authenticate, requireAdmin, centerController.update);
router.delete('/:id', authenticate, requireAdmin, centerController.deactivate);
router.get('/:id/inventory', authenticate, centerController.getInventory);

module.exports = router;
