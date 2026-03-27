const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { body } = require('express-validator');
const donationController = require('../controllers/donationController');
const { authenticate } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `item_${Date.now()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/stats', authenticate, donationController.stats);
router.get('/', authenticate, donationController.list);
router.post('/', authenticate, upload.single('image'), [
  body('category_id').isInt().withMessage('Categoría inválida'),
  body('quantity').isInt({ min: 1 }).withMessage('Cantidad debe ser mayor a 0'),
  body('center_name').notEmpty().isString().withMessage('Centro de entrega requerido'),
  body('center_latitude').isFloat({ min: -90, max: 90 }).withMessage('Latitud inválida'),
  body('center_longitude').isFloat({ min: -180, max: 180 }).withMessage('Longitud inválida'),
], donationController.create);

module.exports = router;
