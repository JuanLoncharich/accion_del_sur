const { Op } = require('sequelize');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const { Distribution, Item, Category, User, sequelize } = require('../models');
const stellarService = require('../services/blockchain/stellarService');
const {
  generateSaltHex,
  buildRecipientCommitment,
  buildSignatureHash,
  buildReceiptHash,
  buildCanonicalReceipt,
} = require('../utils/cryptoEvidence');

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
      center_name,
      center_latitude,
      center_longitude,
    } = req.body;

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
      center_name,
      center_latitude,
      center_longitude,
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

    await distribution.update({
      receipt_payload: JSON.parse(buildCanonicalReceipt(receiptPayload)),
      receipt_hash: receiptHash,
      status: 'pending_anchor',
      ...getRequestEvidence(req),
    }, { transaction: t });

    await t.commit();

    let blockchainResult;
    try {
      blockchainResult = await stellarService.recordVerifiedDistribution({
        distribution_id: distribution.id,
        item_id: distribution.item_id,
        quantity: distribution.quantity,
        recipient_commitment: distribution.recipient_commitment,
        signature_hash: distribution.signature_hash,
        receipt_hash: receiptHash,
        operator_id: distribution.registered_by,
        assurance_level: distribution.assurance_level || 'MANUAL_VERIFIED',
        center_latitude: distribution.center_latitude,
        center_longitude: distribution.center_longitude,
      });
    } catch (anchorError) {
      await distribution.update({ status: 'pending_anchor' });
      return res.status(202).json({
        distribution_id: distribution.id,
        status: 'pending_anchor',
        message: 'La ancla blockchain falló. La entrega no queda cerrada de forma definitiva.',
        error: anchorError.message,
      });
    }

    const updatePayload = {
      status: 'anchored',
      finalized_at: new Date(),
    };
    if (blockchainResult?.hash) updatePayload.blockchain_hash = blockchainResult.hash;
    if (blockchainResult?.txId) updatePayload.blockchain_tx_id = blockchainResult.txId;

    const successTx = await sequelize.transaction();
    try {
      const item = await Item.findByPk(distribution.item_id, {
        transaction: successTx,
        lock: successTx.LOCK.UPDATE,
      });

      if (!item || !item.is_active) {
        throw new Error('Ítem no disponible al cerrar la entrega');
      }

      if (item.quantity < distribution.quantity) {
        throw new Error('Stock cambió durante el cierre, reintentar la operación');
      }

      await item.update({ quantity: item.quantity - distribution.quantity }, { transaction: successTx });
      await Distribution.update(updatePayload, {
        where: { id: distribution.id },
        transaction: successTx,
      });

      await successTx.commit();
    } catch (closeError) {
      await successTx.rollback();
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
