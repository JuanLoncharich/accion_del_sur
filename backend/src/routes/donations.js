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
  body('center_id').optional().isInt({ min: 1 }).withMessage('center_id inválido'),
  body('center_name').optional().isString().withMessage('center_name inválido'),
  body('center_latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Latitud inválida'),
  body('center_longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Longitud inválida'),
  body('donation_reception_id').optional().isInt({ min: 1 }).withMessage('donation_reception_id inválido'),
  body('donor_email').optional().isEmail().withMessage('donor_email inválido'),
], donationController.create);

module.exports = router;
