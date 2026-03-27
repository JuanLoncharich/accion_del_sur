const { TokenTransfer, Center, Item, Category, User, sequelize } = require('../models');
const stellarService = require('../services/blockchain/stellarService');

exports.create = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const { item_id, from_center_id, to_center_id, quantity, reason } = req.body;

    console.log('==========================================');
    console.log('[TRANSFER DEBUG] Iniciando transferencia');
    console.log('[TRANSFER DEBUG] item_id:', item_id);
    console.log('[TRANSFER DEBUG] from_center_id:', from_center_id);
    console.log('[TRANSFER DEBUG] to_center_id:', to_center_id);
    console.log('[TRANSFER DEBUG] quantity:', quantity);
    console.log('[TRANSFER DEBUG] reason:', reason);

    if (!item_id || !from_center_id || !to_center_id) {
      await t.rollback();
      return res.status(400).json({ error: 'Se requiere item_id, from_center_id y to_center_id' });
    }

    if (from_center_id === to_center_id) {
      await t.rollback();
      return res.status(400).json({ error: 'Origen y destino no pueden ser iguales' });
    }

    const fromCenter = await Center.findByPk(from_center_id, { transaction: t });
    const toCenter = await Center.findByPk(to_center_id, { transaction: t });

    console.log('[TRANSFER DEBUG] fromCenter:', fromCenter ? { id: fromCenter.id, name: fromCenter.name, contract_id: fromCenter.blockchain_contract_id } : null);
    console.log('[TRANSFER DEBUG] toCenter:', toCenter ? { id: toCenter.id, name: toCenter.name, contract_id: toCenter.blockchain_contract_id } : null);

    if (!fromCenter || !fromCenter.is_active) {
      await t.rollback();
      return res.status(404).json({ error: 'Centro origen no encontrado o inactivo' });
    }
    if (!toCenter || !toCenter.is_active) {
      await t.rollback();
      return res.status(404).json({ error: 'Centro destino no encontrado o inactivo' });
    }

    const item = await Item.findByPk(item_id, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!item || !item.is_active) {
      await t.rollback();
      return res.status(404).json({ error: 'Item no encontrado' });
    }

    if (item.current_center_id !== from_center_id) {
      await t.rollback();
      return res.status(409).json({
        error: `El item no está en el centro origen. Centro actual: ${item.current_center_id}`,
      });
    }

    const transferQty = quantity || item.quantity;

    // Create transfer record
    const transfer = await TokenTransfer.create({
      item_id,
      from_center_id,
      to_center_id,
      quantity: transferQty,
      reason: reason || null,
      status: 'pending',
      transferred_by: req.user.id,
    }, { transaction: t });

    console.log('[TRANSFER DEBUG] Transfer record created, ID:', transfer.id);

    // Blockchain: register egreso in source center contract
    let egresoResult = null;
    let ingresoResult = null;

    if (fromCenter.blockchain_contract_id && toCenter.blockchain_contract_id) {
      console.log('[TRANSFER DEBUG] Ambos centros tienen contract_id, intentando registrar en blockchain...');
      console.log('[TRANSFER DEBUG] fromCenter.blockchain_contract_id:', fromCenter.blockchain_contract_id);
      console.log('[TRANSFER DEBUG] toCenter.blockchain_contract_id:', toCenter.blockchain_contract_id);
      console.log('[TRANSFER DEBUG] stellarService.enabled:', stellarService.isEnabled);
      console.log('[TRANSFER DEBUG] stellarService.keypair:', stellarService.keypair ? 'configured' : 'NOT configured');

      try {
        console.log('[TRANSFER DEBUG] Llamando a registrarEgresoCentro...');
        egresoResult = await stellarService.registrarEgresoCentro(
          fromCenter.blockchain_contract_id,
          {
            itemId: item_id,
            cantidad: transferQty,
            destino: toCenter.blockchain_contract_id,
            motivo: reason || `Transferencia a ${toCenter.name}`,
          }
        );
        console.log('[TRANSFER DEBUG] registrarEgresoCentro EXITOSO:', egresoResult);

        console.log('[TRANSFER DEBUG] Llamando a registrarIngresoCentro...');
        ingresoResult = await stellarService.registrarIngresoCentro(
          toCenter.blockchain_contract_id,
          {
            itemId: item_id,
            cantidad: transferQty,
            origen: fromCenter.blockchain_contract_id,
            motivo: reason || `Transferencia desde ${fromCenter.name}`,
          }
        );
        console.log('[TRANSFER DEBUG] registrarIngresoCentro EXITOSO:', ingresoResult);

        await transfer.update({
          egreso_blockchain_hash: egresoResult.hash,
          egreso_blockchain_tx: egresoResult.txId,
          ingreso_blockchain_hash: ingresoResult.hash,
          ingreso_blockchain_tx: ingresoResult.txId,
          status: 'anchored',
        }, { transaction: t });

        console.log('[TRANSFER DEBUG] Transfer updated to anchored status');
      } catch (blockchainError) {
        console.error('[TRANSFER DEBUG] ✗✗✗ ERROR EN BLOCKCHAIN ✗✗✗');
        console.error('[TRANSFER DEBUG] Error name:', blockchainError.name);
        console.error('[TRANSFER DEBUG] Error message:', blockchainError.message);
        console.error('[TRANSFER DEBUG] Error stack:', blockchainError.stack);
        console.error('[TRANSFER DEBUG] Error code:', blockchainError.code);
        console.error('[TRANSFER DEBUG] Error details:', JSON.stringify(blockchainError, null, 2));

        await transfer.update({ status: 'failed' }, { transaction: t });
        console.log('[TRANSFER DEBUG] Transfer status set to failed');
        // Still update DB location even if blockchain fails
      }
    } else {
      console.log('[TRANSFER DEBUG] Uno o ambos centros NO tienen contract_id');
      console.log('[TRANSFER DEBUG] fromCenter.blockchain_contract_id:', fromCenter.blockchain_contract_id);
      console.log('[TRANSFER DEBUG] toCenter.blockchain_contract_id:', toCenter.blockchain_contract_id);
    }

    // Update item location in DB
    console.log('[TRANSFER DEBUG] Actualizando ubicación del item en DB...');
    await item.update({ current_center_id: to_center_id }, { transaction: t });
    console.log('[TRANSFER DEBUG] Item actualizado a centro:', to_center_id);

    await t.commit();
    console.log('[TRANSFER DEBUG] Transacción commitada');

    const result = await TokenTransfer.findByPk(transfer.id, {
      include: [
        { model: Item, as: 'item', include: [{ model: Category, as: 'category' }] },
        { model: Center, as: 'fromCenter' },
        { model: Center, as: 'toCenter' },
        { model: User, as: 'transferredBy', attributes: ['id', 'username'] },
      ],
    });

    console.log('[TRANSFER DEBUG] Enviando respuesta...');
    console.log('==========================================');
    res.status(201).json(result);
  } catch (error) {
    console.error('[TRANSFER DEBUG] ✗✗✗ ERROR GENERAL ✗✗✗');
    console.error('[TRANSFER DEBUG] Error:', error.message);
    console.error('[TRANSFER DEBUG] Stack:', error.stack);
    if (!t.finished) await t.rollback();
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
