const { Op } = require('sequelize');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const { Distribution, Item, Category, User, Center, sequelize } = require('../models');
const sftService = require('../services/blockchain/sftService');
const stellarService = require('../services/blockchain/stellarService');
const {
  generateSaltHex,
  buildRecipientCommitment,
  buildSignatureHash,
  buildReceiptHash,
  buildCanonicalReceipt,
} = require('../utils/cryptoEvidence');

const isSftEnabled = () =>
  process.env.STELLAR_ENABLED === 'true' && Boolean(process.env.SOROBAN_CONTRACT_SFT);

const isValidTokenIdHex = (value) => /^[a-f0-9]{64}$/i.test(String(value || '').trim());

const resolveTokenIdFromItem = (item) => {
  if (isValidTokenIdHex(item?.blockchain_hash)) {
    return String(item.blockchain_hash).trim().toLowerCase();
  }
  return sftService.computeTokenId(item.id);
};

const DRAFT_EXPIRATION_MINUTES = 10;

const getRequestEvidence = (req) => ({
  capture_ip: req.headers['x-forwarded-for'] || req.ip || null,
  capture_device: req.headers['user-agent'] || null,
  capture_terminal: req.headers['x-terminal-id'] || req.headers['x-device-id'] || null,
});

const hasExpired = (distribution) => {
  if (!distribution.expires_at) return false;
  return new Date(distribution.expires_at).getTime() < Date.now();
};

const findDistributionForFlow = async (distributionId) => {
  return Distribution.findByPk(distributionId, {
    include: [
      { model: Item, as: 'item', include: [{ model: Category, as: 'category' }] },
      { model: User, as: 'registeredBy', attributes: ['id', 'username'] },
    ],
  });
};

exports.prepare = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
    }

    const {
      item_id,
      quantity,
      notes,
      center_id,
    } = req.body;

    const center = await Center.findByPk(center_id);
    if (!center || !center.is_active) {
      return res.status(404).json({ error: 'Centro no encontrado o inactivo' });
    }

    const item = await Item.findByPk(item_id);
    if (!item || !item.is_active) {
      return res.status(404).json({ error: 'Ítem no encontrado' });
    }

    if (item.quantity < quantity) {
      return res.status(400).json({
        error: `Stock insuficiente. Disponible: ${item.quantity}, solicitado: ${quantity}`,
      });
    }

    const nonce = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + DRAFT_EXPIRATION_MINUTES * 60 * 1000);

    const distribution = await Distribution.create({
      item_id,
      quantity,
      notes,
      nonce,
      expires_at: expiresAt,
      status: 'draft',
      registered_by: req.user.id,
      center_name: center.name,
      center_latitude: center.latitude,
      center_longitude: center.longitude,
      ...getRequestEvidence(req),
    });

    const result = await findDistributionForFlow(distribution.id);
    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

exports.identifyManual = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
    }

    const distribution = await Distribution.findByPk(req.params.id);
    if (!distribution) return res.status(404).json({ error: 'Distribución no encontrada' });

    if (distribution.status !== 'draft') {
      return res.status(409).json({ error: 'La distribución no está en estado draft' });
    }

    if (hasExpired(distribution)) {
      return res.status(409).json({ error: 'El borrador venció y debe recrearse' });
    }

    const { receiver_identifier, doc_type = 'DNI' } = req.body;
    const salt = generateSaltHex(16);
    const recipientCommitment = buildRecipientCommitment({
      docType: doc_type,
      docNumber: receiver_identifier,
      salt,
      distributionId: distribution.id,
    });

    await distribution.update({
      receiver_identifier,
      recipient_salt: salt,
      identity_capture_method: 'manual',
      assurance_level: 'MANUAL_VERIFIED',
      recipient_commitment: recipientCommitment,
      status: 'identified',
      ...getRequestEvidence(req),
    });

    return res.json({
      distribution_id: distribution.id,
      status: 'identified',
      recipient_commitment: recipientCommitment,
      identity_capture_method: 'manual',
      assurance_level: 'MANUAL_VERIFIED',
    });
  } catch (error) {
    next(error);
  }
};

exports.sign = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
    }

    const distribution = await Distribution.findByPk(req.params.id);
    if (!distribution) return res.status(404).json({ error: 'Distribución no encontrada' });

    if (distribution.status !== 'identified') {
      return res.status(409).json({ error: 'La identidad debe validarse antes de firmar' });
    }

    if (hasExpired(distribution)) {
      return res.status(409).json({ error: 'El borrador venció y debe recrearse' });
    }

    const { signature_data, signature_mime = 'image/png' } = req.body;
    const signatureHash = buildSignatureHash(signature_data);

    await distribution.update({
      signature_data,
      signature_mime,
      signature_hash: signatureHash,
      status: 'signed',
      ...getRequestEvidence(req),
    });

    return res.json({
      distribution_id: distribution.id,
      status: 'signed',
      signature_hash: signatureHash,
    });
  } catch (error) {
    next(error);
  }
};

exports.finalize = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const distribution = await Distribution.findByPk(req.params.id, {
      include: [{ model: Item, as: 'item' }],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!distribution) {
      await t.rollback();
      return res.status(404).json({ error: 'Distribución no encontrada' });
    }

    if (distribution.status !== 'signed') {
      await t.rollback();
      return res.status(409).json({ error: 'No se puede finalizar sin DNI manual y firma' });
    }

    if (hasExpired(distribution)) {
      await t.rollback();
      return res.status(409).json({ error: 'El borrador venció y debe recrearse' });
    }

    if (!distribution.receiver_identifier || !distribution.signature_hash || !distribution.recipient_commitment) {
      await t.rollback();
      return res.status(400).json({ error: 'Falta evidencia obligatoria para finalizar' });
    }

    if (!distribution.item || !distribution.item.is_active) {
      await t.rollback();
      return res.status(404).json({ error: 'Ítem no disponible' });
    }

    if (distribution.item.quantity < distribution.quantity) {
      await t.rollback();
      return res.status(400).json({
        error: `Stock insuficiente. Disponible: ${distribution.item.quantity}, solicitado: ${distribution.quantity}`,
      });
    }

    // ── Validar que el ítem esté en un centro con contrato SFT ─────────────────
    if (isSftEnabled()) {
      if (!distribution.item.current_center_id) {
        await t.rollback();
        return res.status(400).json({
          error: 'El ítem no está asignado a ningún centro. Asigne un centro antes de distribuir.',
        });
      }
      const center = await Center.findByPk(distribution.item.current_center_id, { transaction: t });
      if (!center || !center.blockchain_contract_id) {
        await t.rollback();
        return res.status(400).json({
          error: 'El centro del ítem no tiene contrato blockchain desplegado.',
        });
      }
    }

    const receiptPayload = {
      assurance_level: distribution.assurance_level,
      distribution_id: distribution.id,
      identity_capture_method: distribution.identity_capture_method,
      item_id: distribution.item_id,
      item_name: distribution.item.name,
      notes: distribution.notes || null,
      operator_id: distribution.registered_by,
      quantity: distribution.quantity,
      recipient_commitment: distribution.recipient_commitment,
      signature_hash: distribution.signature_hash,
      center: {
        name: distribution.center_name || null,
        latitude: distribution.center_latitude,
        longitude: distribution.center_longitude,
      },
      timestamp: new Date().toISOString(),
    };

    const receiptHash = buildReceiptHash(receiptPayload);

    // Guardar receipt antes del blockchain call
    await distribution.update({
      receipt_payload: JSON.parse(buildCanonicalReceipt(receiptPayload)),
      receipt_hash: receiptHash,
      status: 'pending_anchor',
      ...getRequestEvidence(req),
    }, { transaction: t });

    await t.commit();

    // ── Blockchain principal: contrato_entregas (DNI + firma) ───────────────
    let blockchainResult = null;
    if (stellarService.isEnabled) {
      try {
        blockchainResult = await stellarService.recordVerifiedDistribution({
          distribution_id: distribution.id,
          item_id: distribution.item_id,
          quantity: distribution.quantity,
          recipient_commitment: distribution.recipient_commitment,
          signature_hash: distribution.signature_hash,
          receipt_hash: receiptHash,
          operator_id: distribution.registered_by,
          assurance_level: distribution.assurance_level,
          center_latitude: distribution.center_latitude,
          center_longitude: distribution.center_longitude,
        });
      } catch (anchorError) {
        console.error('[Entregas] Error en registrar_entrega_verificada:', anchorError.message);
        await Distribution.update({ status: 'failed' }, { where: { id: distribution.id } });
        return res.status(503).json({
          error: 'Error al registrar en blockchain. La entrega no fue procesada.',
          detail: anchorError.message,
        });
      }
    }

    // ── Burn SFT (no bloqueante): reduce balance on-chain del centro ─────────
    if (isSftEnabled()) {
      try {
        const item = await Item.findByPk(distribution.item_id);
        const center = item?.current_center_id ? await Center.findByPk(item.current_center_id) : null;
        if (item && center?.blockchain_contract_id && item.token_status === 'minted') {
          const tokenId = resolveTokenIdFromItem(item);
          await sftService.burnForDistribution({
            fromAddress: center.blockchain_contract_id,
            tokenId,
            cantidad: distribution.quantity,
            recipientCommitment: distribution.recipient_commitment,
            signatureHash: distribution.signature_hash,
            operatorId: distribution.registered_by,
          });
        }
      } catch (burnError) {
        console.warn('[SFT] Burn no bloqueante falló en distribución:', burnError.message);
      }
    }

    // ── MySQL: descontar stock y confirmar distribución ─────────────────────
    const closeTx = await sequelize.transaction();
    try {
      const item = await Item.findByPk(distribution.item_id, {
        transaction: closeTx,
        lock: closeTx.LOCK.UPDATE,
      });

      if (!item || !item.is_active) throw new Error('Ítem no disponible al cerrar la entrega');
      if (item.quantity < distribution.quantity) {
        throw new Error('Stock cambió durante el cierre, reintentar la operación');
      }

      await item.update(
        { quantity: item.quantity - distribution.quantity },
        { transaction: closeTx }
      );

      await Distribution.update({
        status: 'anchored',
        finalized_at: new Date(),
        blockchain_hash: blockchainResult?.hash || null,
        blockchain_tx_id: blockchainResult?.txId || null,
      }, {
        where: { id: distribution.id },
        transaction: closeTx,
      });

      await closeTx.commit();
    } catch (closeError) {
      await closeTx.rollback();
      await Distribution.update({ status: 'failed' }, { where: { id: distribution.id } });
      throw closeError;
    }

    const result = await findDistributionForFlow(distribution.id);
    return res.json(result);
  } catch (error) {
    if (!t.finished) {
      await t.rollback();
    }
    next(error);
  }
};

exports.create = exports.prepare;

exports.list = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, category_id, receiver, from, to } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    const itemWhere = { is_active: true };

    if (category_id) itemWhere.category_id = category_id;
    if (receiver) where.receiver_identifier = { [Op.like]: `%${receiver}%` };
    if (from || to) {
      where.created_at = {};
      if (from) where.created_at[Op.gte] = new Date(from);
      if (to) where.created_at[Op.lte] = new Date(to + 'T23:59:59');
    }

    const { count, rows } = await Distribution.findAndCountAll({
      where,
      include: [
        {
          model: Item,
          as: 'item',
          where: itemWhere,
          include: [{ model: Category, as: 'category' }],
        },
        { model: User, as: 'registeredBy', attributes: ['id', 'username'] },
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.json({ total: count, page: parseInt(page), data: rows });
  } catch (error) {
    next(error);
  }
};

exports.stats = async (req, res, next) => {
  try {
    const totalDistributions = await Distribution.count();

    res.json({ totalDistributions });
  } catch (error) {
    next(error);
  }
};
