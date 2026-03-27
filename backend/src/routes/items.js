const express = require('express');
const router = express.Router();
const itemController = require('../controllers/itemController');
const { authenticate } = require('../middleware/auth');

router.get('/export/csv', authenticate, itemController.exportCSV);
router.get('/stock-by-category', authenticate, itemController.stockByCategory);
router.get('/', authenticate, itemController.list);
router.get('/:id', authenticate, itemController.getOne);
router.put('/:id', authenticate, itemController.update);
router.delete('/:id', authenticate, itemController.deactivate);

module.exports = router;
