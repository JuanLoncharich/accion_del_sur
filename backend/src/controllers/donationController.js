const { Op } = require('sequelize');
const { validationResult } = require('express-validator');
const { Donation, Item, Category, User, sequelize } = require('../models');
const stellarService = require('../services/blockchain/stellarService');
const { buildCenterGeoHash } = require('../utils/cryptoEvidence');

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
      center_name,
      center_latitude,
      center_longitude,
    } = req.body;

    const centerGeoHash = buildCenterGeoHash({
      centerName: center_name,
      latitude: center_latitude,
      longitude: center_longitude,
    });

    // Buscar ítem existente con mismos atributos (comparación en JS porque MySQL no ordena JSON igual)
    const candidatos = await Item.findAll({
      where: { category_id, is_active: true },
      transaction: t,
    });
    const attrsStr = JSON.stringify(
      Object.keys(attributes || {}).sort().reduce((acc, k) => { acc[k] = attributes[k]; return acc; }, {})
    );
    let item = candidatos.find((c) => {
      const cStr = JSON.stringify(
        Object.keys(c.attributes || {}).sort().reduce((acc, k) => { acc[k] = c.attributes[k]; return acc; }, {})
      );
      return cStr === attrsStr;
    }) || null;

    // Si no existe, generar nombre automático y crear
    if (!item) {
      const category = await Category.findByPk(category_id, { transaction: t });
      if (!category) {
        await t.rollback();
        return res.status(404).json({ error: 'Categoría no encontrada' });
      }

      const attrValues = Object.values(attributes || {}).filter(Boolean).join(' - ');
      const name = attrValues ? `${category.name} - ${attrValues}` : category.name;

      const image_url = req.file ? `/uploads/${req.file.filename}` : null;

      item = await Item.create(
        { category_id, name, quantity: 0, attributes, image_url },
        { transaction: t }
      );
    }

    // Actualizar stock
    await item.update({ quantity: item.quantity + parseInt(quantity) }, { transaction: t });

    // Registrar donación
    const donation = await Donation.create(
      {
        item_id: item.id,
        quantity,
        notes,
        registered_by: req.user.id,
        center_name,
        center_latitude,
        center_longitude,
        center_geo_hash: centerGeoHash,
        status: 'pending',
      },
      { transaction: t }
    );

    await t.commit();

    // Blockchain (graceful degradation) — persiste hash si el minteo tiene éxito
    try {
      const blockchainResult = await stellarService.mintDonationToken({
        item,
        donation,
        center_name,
        center_latitude,
        center_longitude,
        center_geo_hash: centerGeoHash,
      });
      if (blockchainResult?.hash) {
        await item.update({
          blockchain_hash: blockchainResult.hash,
          blockchain_tx_id: blockchainResult.txId,
          token_status: 'minted',
        });

        await donation.update({
          blockchain_hash: blockchainResult.hash,
          blockchain_tx_id: blockchainResult.txId,
          status: 'anchored',
        });
      }
    } catch (blockchainError) {
      console.error('[Stellar] Error en minteo:', blockchainError.message);
      await item.update({ token_status: 'failed' }).catch(() => {});
      await donation.update({ status: 'failed' }).catch(() => {});
    }

    const result = await Donation.findByPk(donation.id, {
      include: [
        { model: Item, as: 'item', include: [{ model: Category, as: 'category' }] },
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
