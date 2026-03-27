const { Op } = require('sequelize');
const { Item, Category, Donation, Distribution, Center, sequelize } = require('../models');
const stellarService = require('../services/blockchain/stellarService');

exports.list = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, category_id, search } = req.query;
    const offset = (page - 1) * limit;

    const where = { is_active: true };
    if (category_id) where.category_id = category_id;
    if (search) where.name = { [Op.like]: `%${search}%` };

    const { count, rows } = await Item.findAndCountAll({
      where,
      include: [{ model: Category, as: 'category' }],
      order: [['updated_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    res.json({ total: count, page: parseInt(page), data: rows });
  } catch (error) {
    next(error);
  }
};

exports.getOne = async (req, res, next) => {
  try {
    const item = await Item.findByPk(req.params.id, {
      include: [
        { model: Category, as: 'category' },
        { model: Donation, as: 'donations', limit: 10, order: [['created_at', 'DESC']] },
        { model: Distribution, as: 'distributions', limit: 10, order: [['created_at', 'DESC']] },
      ],
    });

    if (!item || !item.is_active) return res.status(404).json({ error: 'Ítem no encontrado' });

    res.json(item);
  } catch (error) {
    next(error);
  }
};

exports.update = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const item = await Item.findByPk(req.params.id, { transaction: t });
    if (!item || !item.is_active) {
      await t.rollback();
      return res.status(404).json({ error: 'Ítem no encontrado' });
    }

    // Verificar si se está actualizando el centro
    const newCenterId = req.body.current_center_id;
    const oldCenterId = item.current_center_id;

    // Actualizar el item
    await item.update(req.body, { transaction: t });

    // Si el centro cambió y es un centro válido, registrar en blockchain
    if (newCenterId && newCenterId !== oldCenterId) {
      const center = await Center.findByPk(newCenterId, { transaction: t });

      if (center && center.is_active && center.blockchain_contract_id) {
        try {
          console.log(`[Item] Registrando item ${item.id} en centro ${center.name} (${center.blockchain_contract_id})`);

          await stellarService.registrarIngresoCentro(
            center.blockchain_contract_id,
            {
              itemId: item.id,
              cantidad: item.quantity,
              origen: oldCenterId ? 'transferencia' : 'donacion',
              motivo: `Item asignado a centro ${center.name}`,
            }
          );

          console.log(`[Item] Item ${item.id} registrado exitosamente en centro ${center.name}`);
        } catch (blockchainError) {
          console.error(`[Item] Error registrando item en centro:`, blockchainError.message);
          // No fallamos la operación si blockchain falla (graceful degradation)
        }
      }
    }

    await t.commit();

    // Recargar el item actualizado para devolverlo
    const updatedItem = await Item.findByPk(req.params.id, {
      include: [{ model: Category, as: 'category' }],
    });

    res.json(updatedItem);
  } catch (error) {
    if (!t.finished) await t.rollback();
    next(error);
  }
};

exports.deactivate = async (req, res, next) => {
  try {
    const item = await Item.findByPk(req.params.id);
    if (!item) return res.status(404).json({ error: 'Ítem no encontrado' });

    await item.update({ is_active: false });
    res.json({ message: 'Ítem eliminado' });
  } catch (error) {
    next(error);
  }
};

exports.exportCSV = async (req, res, next) => {
  try {
    const items = await Item.findAll({
      where: { is_active: true },
      include: [{ model: Category, as: 'category' }],
      order: [['category_id', 'ASC'], ['name', 'ASC']],
    });

    const header = 'ID,Categoría,Nombre,Cantidad,Estado Blockchain,Última Actualización\n';
    const rows = items.map((item) => {
      const attrs = item.attributes ? JSON.stringify(item.attributes).replace(/"/g, '""') : '';
      return `${item.id},"${item.category?.name || ''}","${item.name}",${item.quantity},${item.token_status},"${item.updated_at}"`;
    });

    const csv = header + rows.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="inventario.csv"');
    res.send('\ufeff' + csv); // BOM para Excel con UTF-8
  } catch (error) {
    next(error);
  }
};

exports.stockByCategory = async (req, res, next) => {
  try {
    const result = await sequelize.query(
      `SELECT c.name as category, SUM(i.quantity) as total
       FROM items i
       JOIN categories c ON i.category_id = c.id
       WHERE i.is_active = 1 AND c.is_active = 1
       GROUP BY c.id, c.name
       ORDER BY total DESC`,
      { type: sequelize.constructor.QueryTypes.SELECT }
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
};
