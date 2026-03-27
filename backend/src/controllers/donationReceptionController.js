const crypto = require('crypto');
const { Op } = require('sequelize');
const { validationResult } = require('express-validator');
const {
  DonationReception,
  DonationReceptionDetail,
  Item,
  Donation,
  User,
  sequelize,
} = require('../models');
const stellarService = require('../services/blockchain/stellarService');
const {
  generateSaltHex,
  normalizeEmail,
  buildDonorEmailCommitment,
  buildReceptionAnchorHash,
  buildReceptionSignatureHash,
} = require('../utils/cryptoEvidence');

const PUBLIC_STATUS_LABEL = {
  processing: 'Procesando',
  completed: 'Completada',
  partially_rejected: 'Parcialmente rechazada',
  rejected: 'Rechazada',
  failed_anchor: 'Error de anclaje',
};

const maskedNotFound = (res) => res.status(404).json({ error: 'No se encontró la confirmación solicitada' });

const buildQrUrl = (token) => {
  const base = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}/confirmacion-donacion/${token}`;
};

const buildPublicPayload = (reception) => {
  const isFinal = reception.status !== 'processing';

  return {
    token: reception.public_token_qr,
    status: reception.status,
    status_label: PUBLIC_STATUS_LABEL[reception.status] || reception.status,
    privacy_notice: 'Email visible solo para quien tenga el QR. No se publica en listados generales.',
    donor_email: reception.donor_email,
    rejection_reason: isFinal ? reception.rejection_reason : null,
    finalized_at: reception.finalized_at,
    items: isFinal
      ? (reception.details || []).map((detail) => ({
          item_id: detail.item_id,
          item_name: detail.item?.name || `Ítem #${detail.item_id}`,
          quantity_received: detail.quantity_received,
          quantity_accepted: detail.quantity_accepted,
          quantity_rejected: detail.quantity_rejected,
          rejection_reason_item: detail.rejection_reason_item,
        }))
      : [],
    blockchain: {
      available: Boolean(reception.anchored_tx_id && reception.anchored_hash),
      tx_id: reception.anchored_tx_id,
      anchored_hash: reception.anchored_hash,
    },
  };
};

const validateFinalizePayload = (details = [], rejectionReason) => {
  if (!Array.isArray(details) || details.length === 0) {
    return 'Debe enviar al menos un ítem de detalle';
  }

  let acceptedTotal = 0;
  let rejectedTotal = 0;

  for (const detail of details) {
    const received = Number(detail.quantity_received);
    const accepted = Number(detail.quantity_accepted);
    const rejected = Number(detail.quantity_rejected || 0);

    if (!Number.isInteger(received) || received <= 0) {
      return 'quantity_received debe ser entero mayor a 0';
    }

    if (!Number.isInteger(accepted) || accepted < 0) {
      return 'quantity_accepted debe ser entero mayor o igual a 0';
    }

    if (!Number.isInteger(rejected) || rejected < 0) {
      return 'quantity_rejected debe ser entero mayor o igual a 0';
    }

    if (accepted + rejected !== received) {
      return 'quantity_accepted + quantity_rejected debe coincidir con quantity_received';
    }

    acceptedTotal += accepted;
    rejectedTotal += rejected;
  }

  if (acceptedTotal === 0 && rejectedTotal === 0) {
    return 'Debe existir cantidad aceptada o rechazada';
  }

  const needsReason = rejectedTotal > 0;
  if (needsReason) {
    const hasGlobalReason = Boolean((rejectionReason || '').trim());
    const allRejectedItemsHaveReason = details
      .filter((d) => Number(d.quantity_rejected || 0) > 0)
      .every((d) => Boolean((d.rejection_reason_item || '').trim()));

    if (!hasGlobalReason && !allRejectedItemsHaveReason) {
      return 'Debe informar razón global o razón por ítem para cantidades rechazadas';
    }
  }

  return null;
};

const computeStatus = (details) => {
  const acceptedTotal = details.reduce((sum, d) => sum + Number(d.quantity_accepted || 0), 0);
  const rejectedTotal = details.reduce((sum, d) => sum + Number(d.quantity_rejected || 0), 0);

  if (rejectedTotal === 0 && acceptedTotal > 0) return 'completed';
  if (acceptedTotal > 0 && rejectedTotal > 0) return 'partially_rejected';
  return 'rejected';
};

const isStellarEnabled = () => process.env.STELLAR_ENABLED === 'true';

exports.createInitial = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
    }

    const donorEmailNormalized = normalizeEmail(req.body.donor_email);
    const publicToken = crypto.randomBytes(24).toString('hex');
    const salt = generateSaltHex(16);

    const reception = await DonationReception.create({
      public_token_qr: publicToken,
      donor_email: donorEmailNormalized,
      donor_email_salt: salt,
      donor_email_hash: 'pending',
      status: 'processing',
      created_by: req.user.id,
    });

    const donorHash = buildDonorEmailCommitment({
      email: donorEmailNormalized,
      salt,
      receptionId: reception.id,
    });

    await reception.update({ donor_email_hash: donorHash });

    return res.status(201).json({
      id: reception.id,
      public_token_qr: publicToken,
      qr_url: buildQrUrl(publicToken),
      status: reception.status,
    });
  } catch (error) {
    next(error);
  }
};

exports.listInternal = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const where = {};

    if (status) {
      where.status = status;
    }

    const { count, rows } = await DonationReception.findAndCountAll({
      where,
      include: [
        {
          model: DonationReceptionDetail,
          as: 'details',
          include: [{ model: Item, as: 'item', attributes: ['id', 'name'] }],
        },
        { model: User, as: 'createdBy', attributes: ['id', 'username'] },
        { model: User, as: 'finalizedBy', attributes: ['id', 'username'] },
      ],
      order: [['created_at', 'DESC']],
      limit: Number(limit),
      offset,
    });

    return res.json({ total: count, page: Number(page), data: rows });
  } catch (error) {
    next(error);
  }
};

exports.getPublicByToken = async (req, res, next) => {
  try {
    const reception = await DonationReception.findOne({
      where: { public_token_qr: req.params.token },
      include: [{
        model: DonationReceptionDetail,
        as: 'details',
        include: [{ model: Item, as: 'item', attributes: ['id', 'name'] }],
      }],
    });

    if (!reception) return maskedNotFound(res);

    return res.json(buildPublicPayload(reception));
  } catch (error) {
    next(error);
  }
};

exports.finalizeInternal = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const reception = await DonationReception.findByPk(req.params.id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!reception) {
      await t.rollback();
      return res.status(404).json({ error: 'Recepción no encontrada' });
    }

    if (reception.status !== 'processing') {
      await t.rollback();
      return res.status(409).json({ error: 'Solo se puede finalizar una recepción en processing' });
    }

    const { details = [], rejection_reason } = req.body;
    const payloadError = validateFinalizePayload(details, rejection_reason);
    if (payloadError) {
      await t.rollback();
      return res.status(400).json({ error: payloadError });
    }

    const itemIds = [...new Set(details.map((d) => Number(d.item_id)))];
    const items = await Item.findAll({
      where: { id: { [Op.in]: itemIds }, is_active: true },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (items.length !== itemIds.length) {
      await t.rollback();
      return res.status(400).json({ error: 'Uno o más ítems no son válidos o están inactivos' });
    }

    const itemsById = items.reduce((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});

    const normalizedDetails = details.map((detail) => ({
      item_id: Number(detail.item_id),
      quantity_received: Number(detail.quantity_received),
      quantity_accepted: Number(detail.quantity_accepted),
      quantity_rejected: Number(detail.quantity_rejected || 0),
      rejection_reason_item: (detail.rejection_reason_item || null),
    }));

    for (const detail of normalizedDetails) {
      const item = itemsById[detail.item_id];
      await item.update({ quantity: item.quantity + detail.quantity_accepted }, { transaction: t });

      if (detail.quantity_accepted > 0) {
        await Donation.create({
          item_id: item.id,
          quantity: detail.quantity_accepted,
          notes: `Recepción QR #${reception.id}`,
          registered_by: req.user.id,
          status: 'pending',
        }, { transaction: t });
      }
    }

    await DonationReceptionDetail.bulkCreate(
      normalizedDetails.map((detail) => ({
        reception_id: reception.id,
        ...detail,
      })),
      { transaction: t }
    );

    const nextStatus = computeStatus(normalizedDetails);
    const anchorHash = buildReceptionAnchorHash({
      receptionId: reception.id,
      donorEmailHash: reception.donor_email_hash,
      status: nextStatus,
      details: normalizedDetails,
      rejectionReason: rejection_reason,
    });
    const signatureHash = buildReceptionSignatureHash({
      receptionId: reception.id,
      donorEmailHash: reception.donor_email_hash,
      anchorHash,
    });

    // Calcular totales para anclaje blockchain
    const firstItemId = normalizedDetails[0]?.item_id || 1;
    const totalAccepted = normalizedDetails.reduce((sum, d) => sum + Number(d.quantity_accepted || 0), 0);

    let anchorResult;
    try {
      anchorResult = await stellarService.anchorDonationReception({
        receptionId: reception.id,
        donorEmailHash: reception.donor_email_hash,
        anchorHash,
        signatureHash,
        operatorId: req.user.id,
        itemId: firstItemId,
        totalAcceptedQuantity: totalAccepted,
        centerLat: -34.6037,
        centerLng: -58.3816,
      });
      console.log('[DonationReception] Anclaje exitoso:', anchorResult);
    } catch (error) {
      console.error('[DonationReception] Error en anclaje:', error.message);
      anchorResult = null;
    }

    const hasAnchorTx = Boolean(anchorResult?.txId);
    const finalStatus = !isStellarEnabled() || hasAnchorTx
      ? nextStatus
      : 'failed_anchor';

    await reception.update({
      status: finalStatus,
      rejection_reason: rejection_reason || null,
      anchored_hash: anchorHash,
      anchored_tx_id: anchorResult?.txId || null,
      finalized_by: req.user.id,
      finalized_at: new Date(),
    }, { transaction: t });

    await t.commit();

    const refreshed = await DonationReception.findByPk(reception.id, {
      include: [{
        model: DonationReceptionDetail,
        as: 'details',
        include: [{ model: Item, as: 'item', attributes: ['id', 'name'] }],
      }],
    });

    return res.json({
      id: refreshed.id,
      status: refreshed.status,
      public_token_qr: refreshed.public_token_qr,
      qr_url: buildQrUrl(refreshed.public_token_qr),
      blockchain: {
        tx_id: refreshed.anchored_tx_id,
        anchored_hash: refreshed.anchored_hash,
      },
      details: refreshed.details,
    });
  } catch (error) {
    if (!t.finished) await t.rollback();
    next(error);
  }
};

exports.verifyPublicAnchor = async (req, res, next) => {
  try {
    const reception = await DonationReception.findOne({
      where: { public_token_qr: req.params.token },
      include: [{ model: DonationReceptionDetail, as: 'details' }],
    });

    if (!reception) return maskedNotFound(res);

    if (!reception.anchored_hash || !reception.finalized_at) {
      return res.status(409).json({ verified: false, message: 'La recepción aún no tiene anclaje disponible' });
    }

    const computedStatus = computeStatus(reception.details || []);

    const localAnchorHash = buildReceptionAnchorHash({
      receptionId: reception.id,
      donorEmailHash: reception.donor_email_hash,
      status: computedStatus,
      details: reception.details,
      rejectionReason: reception.rejection_reason,
    });

    const localMatch = localAnchorHash === reception.anchored_hash;
    if (!localMatch) {
      return res.json({
        verified: false,
        local_match: false,
        blockchain_match: false,
        message: 'El hash local no coincide con el hash almacenado',
      });
    }

    const signatureHash = buildReceptionSignatureHash({
      receptionId: reception.id,
      donorEmailHash: reception.donor_email_hash,
      anchorHash: localAnchorHash,
    });

    const chainResult = await stellarService.verifyDonationReceptionAnchor({
      receptionId: reception.id,
      signatureHash,
      anchorHash: localAnchorHash,
    });

    const blockchainMatch = Boolean(chainResult?.verified);

    return res.json({
      verified: localMatch && blockchainMatch,
      local_match: localMatch,
      blockchain_match: blockchainMatch,
      message: localMatch && blockchainMatch
        ? 'La recepción coincide con el anclaje blockchain'
        : (chainResult?.reason || 'No se pudo verificar el anclaje en blockchain'),
      tx_id: reception.anchored_tx_id,
      anchored_hash: reception.anchored_hash,
    });
  } catch (error) {
    next(error);
  }
};
