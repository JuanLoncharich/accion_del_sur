const express = require('express');
const router = express.Router();
const auditController = require('../controllers/auditController');
const { authenticate } = require('../middleware/auth');

router.get('/public/:distributionId', auditController.publicAudit);
router.get('/internal/:distributionId', authenticate, auditController.internalAudit);

module.exports = router;
