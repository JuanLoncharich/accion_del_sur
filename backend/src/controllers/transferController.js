const crypto = require('crypto');
const { TokenTransfer, Item, Center, Category, User, sequelize } = require('../models');
const sftService = require('../services/blockchain/sftService');

const include = [
  { model: Item, as: 'item', include: [{ model: Category, as: 'category' }] },
  { model: Center, as: 'fromCenter' },
  { model: Center, as: 'toCenter' },
  { model: User, as: 'transferredBy', attributes: ['id', 'email'] },
];

// GET /api/transfers
exports.list = async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 20, 500);
    const { count, rows } = await TokenTransfer.findAndCountAll({
      include, order: [['created_at', 'DESC']], limit, offset: (page - 1) * limit,
    });
    const data = rows.map((t) => {
      const base = t.toJSON();
      return {
        ...base,
        item_name: base.item && base.item.name,
        from_center_name: base.fromCenter && base.fromCenter.name,
        to_center_name: base.toCenter && base.toCenter.name,
        created_at: base.created_at,
      };
    });
    res.json({ total: count, page, data });
  } catch (error) { next(error); }
};

// GET /api/transfers/:id
exports.getById = async (req, res, next) => {
  try {
    const transfer = await TokenTransfer.findByPk(req.params.id, { include });
    if (!transfer) return res.status(404).json({ error: 'Transferencia no encontrada' });
    res.json(transfer);
  } catch (error) { next(error); }
};

// POST /api/transfers  { item_id, from_center_id, to_center_id, quantity, reason }
exports.create = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const { item_id, from_center_id, to_center_id, quantity, reason } = req.body;
    if (!item_id || !from_center_id || !to_center_id) {
      await t.rollback(); return res.status(400).json({ error: 'Se requiere item_id, from_center_id y to_center_id' });
    }
    if (Number(from_center_id) === Number(to_center_id)) {
      await t.rollback(); return res.status(400).json({ error: 'Origen y destino no pueden ser iguales' });
    }
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      await t.rollback(); return res.status(400).json({ error: 'Cantidad inválida' });
    }

    const fromCenter = await Center.findByPk(from_center_id, { transaction: t });
    const toCenter = await Center.findByPk(to_center_id, { transaction: t });
    if (!fromCenter || !toCenter) { await t.rollback(); return res.status(404).json({ error: 'Centro no encontrado' }); }

    const item = await Item.findByPk(item_id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!item) { await t.rollback(); return res.status(404).json({ error: 'Item no encontrado' }); }
    if (item.current_center_id !== Number(from_center_id)) {
      await t.rollback();
      return res.status(409).json({ error: `El item no está en el centro origen (centro actual: ${item.current_center_id})` });
    }
    if (Number(item.available_quantity) < qty) {
      await t.rollback(); return res.status(409).json({ error: `Stock insuficiente. Disponible: ${item.available_quantity}` });
    }

    const tokenId = item.token_id || sftService.computeTokenId(item.id);
    const transfer = await TokenTransfer.create({
      item_id, from_center_id, to_center_id, quantity: qty,
      reason: reason || null, status: 'pending', transferred_by: req.user.id, token_id: tokenId,
    }, { transaction: t });

    // Mover la ubicación del insumo al centro destino.
    item.current_center_id = Number(to_center_id);
    await item.save({ transaction: t });

    await t.commit();

    // Blockchain SFT transfer (degradación graceful).
    await tryBlockchainTransfer(transfer, fromCenter, toCenter, qty, reason);

    const result = await TokenTransfer.findByPk(transfer.id, { include });
    res.status(201).json(result);
  } catch (error) {
    if (t && !t.finished) await t.rollback();
    next(error);
  }
};

async function tryBlockchainTransfer(transfer, fromCenter, toCenter, qty, reason) {
  try {
    if (!sftService.isEnabled) return; // sin blockchain → queda 'pending' en local
    if (!fromCenter.blockchain_contract_id || !toCenter.blockchain_contract_id) return; // Fase 5
    const motivoHash = crypto.createHash('sha256').update(reason || `transfer-${transfer.id}`).digest('hex');
    const r = await sftService.transferBetweenCenters({
      fromAddress: fromCenter.blockchain_contract_id,
      toAddress: toCenter.blockchain_contract_id,
      tokenId: transfer.token_id,
      cantidad: qty,
      motivoHash,
    });
    transfer.egreso_blockchain_hash = r.hash;
    transfer.egreso_blockchain_tx = r.txId;
    transfer.ingreso_blockchain_hash = r.hash;
    transfer.ingreso_blockchain_tx = r.txId;
    transfer.status = 'anchored';
    await transfer.save();
  } catch (error) {
    console.error('[Transfer] blockchain error (queda en local):', error.message);
    transfer.status = 'local';
    await transfer.save().catch(() => {});
  }
}
