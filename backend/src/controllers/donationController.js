const { Op } = require('sequelize');
const { validationResult } = require('express-validator');
const { Donation, Item, Category, Center, DonationReception, User, sequelize } = require('../models');
const { buildCenterGeoHash } = require('../utils/cryptoEvidence');
const sftService = require('../services/blockchain/sftService');
const emailService = require('../services/emailService');

const isSftEnabled = () =>
  process.env.STELLAR_ENABLED === 'true' && Boolean(process.env.SOROBAN_CONTRACT_SFT);

const isValidTokenIdHex = (value) => /^[a-f0-9]{64}$/i.test(String(value || '').trim());

exports.create = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      await t.rollback();
      return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
    }

    const {
      category_id,
      attributes,
      quantity,
      notes,
      center_id,
      center_name,
      center_latitude,
      center_longitude,
      donation_reception_id,
      donor_email,
    } = req.body;

    let parsedAttributes = attributes;
    if (typeof parsedAttributes === 'string') {
      try {
        parsedAttributes = JSON.parse(parsedAttributes);
      } catch {
        await t.rollback();
        return res.status(400).json({ error: 'attributes debe ser un JSON válido' });
      }
    }
    if (!parsedAttributes || typeof parsedAttributes !== 'object' || Array.isArray(parsedAttributes)) {
      await t.rollback();
      return res.status(400).json({ error: 'attributes debe ser un objeto' });
    }

    let resolvedCenterName = center_name || null;
    let resolvedCenterLatitude = center_latitude ?? null;
    let resolvedCenterLongitude = center_longitude ?? null;
    let resolvedCenterId = center_id ? Number(center_id) : null;
    let resolvedCenterContractId = null;

    if (!resolvedCenterId && !resolvedCenterName) {
      await t.rollback();
      return res.status(400).json({ error: 'Debe enviar center_id o center_name' });
    }

    if (resolvedCenterId) {
      const center = await Center.findByPk(resolvedCenterId, { transaction: t });
      if (!center || !center.is_active) {
        await t.rollback();
        return res.status(404).json({ error: 'Centro no encontrado o inactivo' });
      }
      resolvedCenterName = center.name;
      resolvedCenterLatitude = center.latitude;
      resolvedCenterLongitude = center.longitude;
      resolvedCenterContractId = center.blockchain_contract_id || null;
    }

    let resolvedDonorEmail = donor_email ? String(donor_email).trim().toLowerCase() : null;
    let resolvedReceptionId = donation_reception_id ? Number(donation_reception_id) : null;

    if (resolvedReceptionId) {
      const reception = await DonationReception.findByPk(resolvedReceptionId, { transaction: t });
      if (!reception) {
        await t.rollback();
        return res.status(404).json({ error: 'Recepción de donación no encontrada' });
      }
      resolvedDonorEmail = reception.donor_email;
    }

    if (!resolvedDonorEmail) {
      await t.rollback();
      return res.status(400).json({
        error: 'Debe indicar donor_email o seleccionar una recepción QR para asociar al donante',
      });
    }

    if (isSftEnabled() && !resolvedCenterId) {
      await t.rollback();
      return res.status(400).json({
        error: 'center_id es obligatorio para mintear en blockchain',
      });
    }

    if (isSftEnabled() && !resolvedCenterContractId) {
      await t.rollback();
      return res.status(400).json({
        error: 'El centro seleccionado no tiene contrato blockchain desplegado',
      });
    }

    const centerGeoHash = buildCenterGeoHash({
      centerName: resolvedCenterName,
      latitude: resolvedCenterLatitude,
      longitude: resolvedCenterLongitude,
    });

    // Cada registro de donación crea un lote independiente para mantener trazabilidad por ingreso.
    const category = await Category.findByPk(category_id, { transaction: t });
    if (!category) {
      await t.rollback();
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }

    const attrValues = Object.values(parsedAttributes).filter(Boolean).join(' - ');
    const name = attrValues ? `${category.name} - ${attrValues}` : category.name;

    const image_url = req.file ? `/uploads/${req.file.filename}` : null;

    const item = await Item.create(
      { category_id, name, quantity: 0, attributes: parsedAttributes, image_url },
      { transaction: t }
    );

    const acceptedQty = parseInt(quantity, 10);
    let mintResult = null;
    let mintedTokenId = null;
    if (isSftEnabled()) {
      const tokenId = isValidTokenIdHex(item.blockchain_hash)
        ? String(item.blockchain_hash).trim().toLowerCase()
        : sftService.computeTokenId(item.id);
      const attributesHash = sftService.computeAttributesHash(item.attributes);
      const signatureHash = buildCenterGeoHash({
        centerName: resolvedDonorEmail,
        latitude: acceptedQty,
        longitude: item.id,
      });

      try {
        mintResult = await sftService.mintToCenter({
          toCenterAddress: resolvedCenterContractId,
          tokenId,
          metadata: {
            item_id: item.id,
            categoria: category?.name || 'sin_categoria',
            nombre: item.name,
            attributes_hash: attributesHash,
          },
          cantidad: acceptedQty,
          firmaHash: signatureHash,
        });
        mintedTokenId = tokenId;
      } catch (blockchainError) {
        await t.rollback();
        return res.status(503).json({
          error: 'Error al registrar en blockchain. La donación no fue guardada.',
          detail: blockchainError.message,
        });
      }
    }

    // Actualizar stock y estado blockchain del item
    await item.update({
      quantity: item.quantity + acceptedQty,
      ...(resolvedCenterId ? { current_center_id: resolvedCenterId } : {}),
      ...(mintResult ? {
        token_status: 'minted',
        blockchain_hash: item.blockchain_hash || mintedTokenId,
        blockchain_tx_id: item.blockchain_tx_id || mintResult.txId,
      } : {}),
    }, { transaction: t });

    // Registrar donación
    const donation = await Donation.create(
      {
        item_id: item.id,
        quantity,
        notes,
        registered_by: req.user.id,
        center_name: resolvedCenterName,
        center_latitude: resolvedCenterLatitude,
        center_longitude: resolvedCenterLongitude,
        center_geo_hash: centerGeoHash,
        center_id: resolvedCenterId,
        donor_email: resolvedDonorEmail,
        donation_reception_id: resolvedReceptionId,
        status: 'anchored',
        blockchain_hash: mintedTokenId,
        blockchain_tx_id: mintResult?.txId || null,
      },
      { transaction: t }
    );

    await t.commit();

    try {
      await emailService.sendDonationAcceptedEmail({
        to: resolvedDonorEmail,
        donationId: donation.id,
        itemName: item.name,
        quantity: acceptedQty,
        centerName: resolvedCenterName,
        mintedTxId: mintResult?.txId || null,
      });
    } catch (mailError) {
      console.error('[Email] Error enviando notificación al donante:', mailError.message);
    }

    const result = await Donation.findByPk(donation.id, {
      include: [
        { model: Item, as: 'item', include: [{ model: Category, as: 'category' }] },
        { model: Center, as: 'center' },
        { model: User, as: 'registeredBy', attributes: ['id', 'username'] },
      ],
    });

    res.status(201).json(result);
  } catch (error) {
    await t.rollback();
    next(error);
  }
};

exports.list = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, category_id, from, to } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    const itemWhere = { is_active: true };

    if (category_id) itemWhere.category_id = category_id;
    if (from || to) {
      where.created_at = {};
      if (from) where.created_at[Op.gte] = new Date(from);
      if (to) where.created_at[Op.lte] = new Date(to + 'T23:59:59');
    }

    const { count, rows } = await Donation.findAndCountAll({
      where,
      include: [
        {
          model: Item,
          as: 'item',
          where: itemWhere,
          include: [{ model: Category, as: 'category' }],
        },
        { model: Center, as: 'center' },
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
    // Total donaciones
    const totalDonations = await Donation.count();

    // Donaciones por semana (últimas 8 semanas)
    const eightWeeksAgo = new Date();
    eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

    const weeklyDonations = await sequelize.query(
      `SELECT
        YEARWEEK(created_at, 1) as week_key,
        MIN(DATE(created_at)) as week_start,
        COUNT(*) as count,
        SUM(quantity) as total_quantity
       FROM donations
       WHERE created_at >= :from
       GROUP BY YEARWEEK(created_at, 1)
       ORDER BY week_key ASC`,
      {
        replacements: { from: eightWeeksAgo },
        type: sequelize.constructor.QueryTypes.SELECT,
      }
    );

    res.json({ totalDonations, weeklyDonations });
  } catch (error) {
    next(error);
  }
};
