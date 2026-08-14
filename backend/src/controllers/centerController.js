const { Center, Item } = require('../models');

const serialize = (center) => ({ ...center.toJSON(), is_active: true, center_type: center.operational_status });

exports.list = async (req, res, next) => {
  try { res.json({ data: (await Center.findAll({ order: [['name', 'ASC']] })).map(serialize) }); }
  catch (error) { next(error); }
};
exports.getById = async (req, res, next) => {
  try {
    const center = await Center.findByPk(req.params.id);
    return center ? res.json(serialize(center)) : res.status(404).json({ error: 'Centro no encontrado' });
  } catch (error) { return next(error); }
};
exports.create = async (req, res, next) => {
  try {
    const center = await Center.create({
      name: req.body.name,
      location: req.body.location || 'Sin especificar',
      operational_status: req.body.operational_status || req.body.center_type || 'OPERATIVO',
      managed_by: req.user.id,
    });
    res.status(201).json(serialize(center));
  } catch (error) { next(error); }
};
exports.update = async (req, res, next) => {
  try {
    const center = await Center.findByPk(req.params.id);
    if (!center) return res.status(404).json({ error: 'Centro no encontrado' });
    await center.update({
      name: req.body.name ?? center.name,
      location: req.body.location ?? center.location,
      operational_status: req.body.operational_status ?? req.body.center_type ?? center.operational_status,
    });
    return res.json(serialize(center));
  } catch (error) { return next(error); }
};
exports.deactivate = async (req, res, next) => {
  try {
    const center = await Center.findByPk(req.params.id);
    if (!center) return res.status(404).json({ error: 'Centro no encontrado' });
    await center.destroy(); return res.json({ message: 'Centro eliminado' });
  } catch (error) { return next(error); }
};
exports.getInventory = async (req, res, next) => {
  try {
    const center = await Center.findByPk(req.params.id);
    if (!center) return res.status(404).json({ error: 'Centro no encontrado' });
    return res.json({ center_id: center.id, center_name: center.name, items: await Item.findAll() });
  } catch (error) { return next(error); }
};
