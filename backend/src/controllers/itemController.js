const { Op } = require('sequelize');
const { Item, Category } = require('../models');

const serialize = (item) => ({
  ...item.toJSON(),
  quantity: item.available_quantity,
  is_active: item.is_active === false ? false : true,
  token_status: item.token_id ? 'minted' : 'pending',
  attributes: null,
  category: item.category,
});
const include = [{ model: Category, as: 'category' }];

exports.list = async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 500);
    const where = {};
    if (req.query.search) where.name = { [Op.like]: `%${req.query.search}%` };
    if (req.query.category_id) where.category_id = req.query.category_id;
    const { count, rows } = await Item.findAndCountAll({ where, include, order: [['name', 'ASC']], limit, offset: (page - 1) * limit });
    res.json({ total: count, page, data: rows.map(serialize) });
  } catch (error) { next(error); }
};
exports.getOne = async (req, res, next) => {
  try {
    const item = await Item.findByPk(req.params.id, { include });
    return item ? res.json(serialize(item)) : res.status(404).json({ error: 'Insumo no encontrado' });
  } catch (error) { return next(error); }
};
exports.update = async (req, res, next) => {
  try {
    const item = await Item.findByPk(req.params.id);
    if (!item) return res.status(404).json({ error: 'Insumo no encontrado' });
    const updates = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.category_id !== undefined) updates.category_id = req.body.category_id;
    if (req.body.available_quantity !== undefined || req.body.quantity !== undefined) updates.available_quantity = Number(req.body.available_quantity ?? req.body.quantity);
    await item.update(updates);
    return res.json(serialize(await Item.findByPk(item.id, { include })));
  } catch (error) { return next(error); }
};
exports.deactivate = async (req, res, next) => {
  try {
    const item = await Item.findByPk(req.params.id);
    if (!item) return res.status(404).json({ error: 'Insumo no encontrado' });
    await item.destroy(); return res.json({ message: 'Insumo eliminado' });
  } catch (error) { return next(error); }
};
exports.stockByCategory = async (req, res, next) => {
  try {
    const items = await Item.findAll({ include });
    const totals = new Map();
    for (const item of items) totals.set(item.category?.name || 'Sin categoría', (totals.get(item.category?.name || 'Sin categoría') || 0) + Number(item.available_quantity));
    res.json(Array.from(totals, ([category, total]) => ({ category, total })));
  } catch (error) { next(error); }
};
exports.exportCSV = async (req, res, next) => {
  try {
    const items = await Item.findAll({ include });
    const lines = ['id,categoria,nombre,cantidad', ...items.map((i) => `${i.id},"${i.category?.name || ''}","${i.name}",${i.available_quantity}`)];
    res.type('text/csv').send(lines.join('\n'));
  } catch (error) { next(error); }
};
