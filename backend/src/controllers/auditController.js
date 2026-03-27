const { Distribution, Item, Category, User, AuditAccessLog } = require('../models');
const stellarService = require('../services/blockchain/stellarService');
const {
  buildRecipientCommitment,
  buildSignatureHash,
  buildReceiptHash,
} = require('../utils/cryptoEvidence');

const buildAuditContext = (req) => ({
  requester_ip: req.headers['x-forwarded-for'] || req.ip || null,
  requester_device: req.headers['user-agent'] || null,
});

exports.publicAudit = async (req, res, next) => {
  try {
    const distribution = await Distribution.findByPk(req.params.distributionId, {
      include: [{ model: Item, as: 'item', include: [{ model: Category, as: 'category' }] }],
    });

    if (!distribution) return res.status(404).json({ error: 'Distribución no encontrada' });

    await AuditAccessLog.create({
      distribution_id: distribution.id,
      access_type: 'public',
      ...buildAuditContext(req),
    });

    const chainRecord = await stellarService.getVerifiedDistribution(distribution.id).catch(() => null);

    return res.json({
      distribution_id: distribution.id,
      item_id: distribution.item_id,
      item_name: distribution.item?.name || null,
      quantity: distribution.quantity,
      timestamp: distribution.finalized_at || distribution.created_at,
      status: distribution.status,
      center: {
        name: distribution.center_name,
        latitude: distribution.center_latitude,
        longitude: distribution.center_longitude,
      },
      integrity: {
        recipient_commitment: distribution.recipient_commitment,
        signature_hash: distribution.signature_hash,
        receipt_hash: distribution.receipt_hash,
      },
      blockchain: {
        tx_id: distribution.blockchain_tx_id,
        hash: distribution.blockchain_hash,
        record: chainRecord,
      },
      pii_exposed: false,
    });
  } catch (error) {
    next(error);
  }
};

exports.internalAudit = async (req, res, next) => {
  try {
    const distribution = await Distribution.findByPk(req.params.distributionId, {
      include: [
        { model: Item, as: 'item', include: [{ model: Category, as: 'category' }] },
        { model: User, as: 'registeredBy', attributes: ['id', 'username', 'email'] },
      ],
    });

    if (!distribution) return res.status(404).json({ error: 'Distribución no encontrada' });

    const recalculatedCommitment = buildRecipientCommitment({
      docType: 'DNI',
      docNumber: distribution.receiver_identifier,
      salt: distribution.recipient_salt,
      distributionId: distribution.id,
    });

    const recalculatedSignature = distribution.signature_data
      ? buildSignatureHash(distribution.signature_data)
      : null;

    const recalculatedReceipt = distribution.receipt_payload
      ? buildReceiptHash(distribution.receipt_payload)
      : null;

    await AuditAccessLog.create({
      distribution_id: distribution.id,
      access_type: 'internal',
      accessed_by: req.user?.id || null,
      purpose: req.query.purpose || 'verificacion_identidad_firma',
      external_reference: req.query.external_reference || null,
      ...buildAuditContext(req),
    });

    const blockchainChecks = await stellarService.verifyDeliveryHashes(
      distribution.id,
      distribution.signature_hash,
      distribution.receipt_hash
    ).catch(() => ({ verified: false, reason: 'No se pudo verificar on-chain' }));

    return res.json({
      distribution,
      verification: {
        recipient_commitment_matches: recalculatedCommitment === distribution.recipient_commitment,
        signature_hash_matches: recalculatedSignature === distribution.signature_hash,
        receipt_hash_matches: recalculatedReceipt === distribution.receipt_hash,
        blockchain_hashes_match: blockchainChecks.verified,
      },
      external_registry_step: {
        required: true,
        status: 'pending_manual_comparison',
        note: 'Comparar firma capturada y DNI contra registro externo oficial bajo protocolo pericial.',
      },
    });
  } catch (error) {
    next(error);
  }
};
