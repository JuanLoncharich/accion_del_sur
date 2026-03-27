const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { authenticate, requireAdmin } = require('../middleware/auth');

router.get('/', authenticate, categoryController.list);
router.post('/', authenticate, requireAdmin, categoryController.create);
router.put('/:id', authenticate, requireAdmin, categoryController.update);
router.delete('/:id', authenticate, requireAdmin, categoryController.deactivate);

router.get('/:id/attributes', authenticate, categoryController.getAttributes);
router.post('/:id/attributes', authenticate, requireAdmin, categoryController.addAttribute);
router.put('/:id/attributes/:attrId', authenticate, requireAdmin, categoryController.updateAttribute);
router.delete('/:id/attributes/:attrId', authenticate, requireAdmin, categoryController.deleteAttribute);

module.exports = router;
