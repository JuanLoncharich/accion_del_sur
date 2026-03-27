const crypto = require('crypto');
const { TokenTransfer, Center, Item, Category, User, sequelize } = require('../models');
const sftService = require('../services/blockchain/sftService');

const isSftEnabled = () =>
  process.env.STELLAR_ENABLED === 'true' && Boolean(process.env.SOROBAN_CONTRACT_SFT);

exports.create = async (req, res, next) => {
  try {
    const { item_id, from_center_id, to_center_id, quantity, reason } = req.body;

    if (!item_id || !from_center_id || !to_center_id) {
      return res.status(400).json({ error: 'Se requiere item_id, from_center_id y to_center_id' });
    }
    if (from_center_id === to_center_id) {
      return res.status(400).json({ error: 'Origen y destino no pueden ser iguales' });
    }

    // ── 1. Validaciones previas al blockchain ─────────────────────────────────
    const [fromCenter, toCenter, item] = await Promise.all([
      Center.findByPk(from_center_id),
      Center.findByPk(to_center_id),
      Item.findByPk(item_id),
    ]);

    if (!fromCenter || !fromCenter.is_active) {
      return res.status(404).json({ error: 'Centro origen no encontrado o inactivo' });
    }
    if (!toCenter || !toCenter.is_active) {
      return res.status(404).json({ error: 'Centro destino no encontrado o inactivo' });
    }
    if (!item || !item.is_active) {
      return res.status(404).json({ error: 'Ítem no encontrado' });
    }
    if (item.current_center_id !== from_center_id) {
      return res.status(409).json({
        error: `El ítem no está en el centro origen. Centro actual: ${item.current_center_id}`,
      });
    }

    const transferQty = quantity || item.quantity;

    if (transferQty <= 0 || transferQty > item.quantity) {
      return res.status(400).json({
        error: `Cantidad inválida. Disponible: ${item.quantity}, solicitado: ${transferQty}`,
      });
    }

    if (isSftEnabled()) {
      if (!fromCenter.blockchain_contract_id) {
        return res.status(400).json({
          error: `El centro origen "${fromCenter.name}" no tiene contrato blockchain`,
        });
      }
      if (!toCenter.blockchain_contract_id) {
        return res.status(400).json({
          error: `El centro destino "${toCenter.name}" no tiene contrato blockchain`,
        });
      }
    }

    // ── 2. Blockchain primero (SFT transfer) ──────────────────────────────────
    let transferResult = null;
    if (isSftEnabled()) {
      const tokenId = sftService.computeTokenId(item_id);
      const motivoHash = crypto.createHash('sha256')
        .update(reason || `Transferencia ${fromCenter.name} → ${toCenter.name}`)
        .digest('hex');

      try {
        transferResult = await sftService.transferBetweenCenters({
          fromAddress: fromCenter.blockchain_contract_id,
          toAddress: toCenter.blockchain_contract_id,
          tokenId,
          cantidad: transferQty,
          motivoHash,
        });
      } catch (blockchainError) {
        console.error('[SFT] Error en transfer:', blockchainError.message);
        return res.status(503).json({
          error: 'Error al registrar en blockchain. La transferencia no fue procesada.',
          detail: blockchainError.message,
        });
      }
    }

    // ── 3. MySQL (solo si blockchain confirmó) ────────────────────────────────
    const t = await sequelize.transaction();
    try {
      const itemLocked = await Item.findByPk(item_id, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (itemLocked.current_center_id !== from_center_id) {
        await t.rollback();
        return res.status(409).json({ error: 'El ítem cambió de ubicación durante la operación' });
      }

      const transfer = await TokenTransfer.create({
        item_id,
        from_center_id,
        to_center_id,
        quantity: transferQty,
        reason: reason || null,
        status: 'anchored',
        transferred_by: req.user.id,
        egreso_blockchain_hash: transferResult?.hash || null,
        egreso_blockchain_tx: transferResult?.txId || null,
        ingreso_blockchain_hash: transferResult?.hash || null,
        ingreso_blockchain_tx: transferResult?.txId || null,
      }, { transaction: t });

      await itemLocked.update({ current_center_id: to_center_id }, { transaction: t });

      await t.commit();

      const result = await TokenTransfer.findByPk(transfer.id, {
        include: [
          { model: Item, as: 'item', include: [{ model: Category, as: 'category' }] },
          { model: Center, as: 'fromCenter' },
          { model: Center, as: 'toCenter' },
          { model: User, as: 'transferredBy', attributes: ['id', 'username'] },
        ],
      });

      return res.status(201).json(result);
    } catch (dbError) {
      await t.rollback();
      throw dbError;
    }
  } catch (error) {
    next(error);
  }
};

exports.list = async (req, res, next) => {
  try {
    const { item_id, center_id, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    if (item_id) where.item_id = item_id;
    if (center_id) {
      const { Op } = require('sequelize');
      where[Op.or] = [
        { from_center_id: center_id },
        { to_center_id: center_id },
      ];
    }

    const { count, rows } = await TokenTransfer.findAndCountAll({
      where,
      include: [
        { model: Item, as: 'item', include: [{ model: Category, as: 'category' }] },
        { model: Center, as: 'fromCenter' },
        { model: Center, as: 'toCenter' },
        { model: User, as: 'transferredBy', attributes: ['id', 'username'] },
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

exports.getById = async (req, res, next) => {
  try {
    const transfer = await TokenTransfer.findByPk(req.params.id, {
      include: [
        { model: Item, as: 'item', include: [{ model: Category, as: 'category' }] },
        { model: Center, as: 'fromCenter' },
        { model: Center, as: 'toCenter' },
        { model: User, as: 'transferredBy', attributes: ['id', 'username'] },
      ],
    });

    if (!transfer) {
      return res.status(404).json({ error: 'Transferencia no encontrada' });
    }

    res.json(transfer);
  } catch (error) {
    next(error);
  }
};
