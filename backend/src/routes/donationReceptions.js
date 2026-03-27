const express = require('express');
const { body, param } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { publicRateLimit } = require('../middleware/publicRateLimit');
const donationReceptionController = require('../controllers/donationReceptionController');

const router = express.Router();

router.get('/', authenticate, donationReceptionController.listInternal);
router.post('/', authenticate, [
  body('donor_email').isEmail().withMessage('Email inválido'),
], donationReceptionController.createInitial);

router.post('/:id/finalize', authenticate, [
  param('id').isInt().withMessage('ID inválido'),
  body('details').isArray({ min: 1 }).withMessage('Debe enviar detalles de recepción'),
], donationReceptionController.finalizeInternal);

router.get('/public/:token', publicRateLimit, donationReceptionController.getPublicByToken);
router.get('/public/:token/verify', publicRateLimit, donationReceptionController.verifyPublicAnchor);

module.exports = router;
