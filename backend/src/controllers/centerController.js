const { Op } = require('sequelize');
const { Center, Item, Shipment, TokenTransfer } = require('../models');
const { destroyIfUnused } = require('../utils/deleteGuard');
const anclaje = require('../services/blockchain/anclaje');

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
    // Despliega el contrato de identidad del centro (si la blockchain está activa).
    const chain = await anclaje.desplegarCentro(center);
    res.status(201).json({ ...serialize(center), blockchain: { status: chain.status, tx: chain.txId } });
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
    return await destroyIfUnused(res, {
      model: Center,
      id: req.params.id,
      entity: 'el centro',
      notFound: 'Centro no encontrado',
      deleted: 'Centro eliminado',
      dependencies: async (center, transaction) => [
        { label: 'envíos', count: await Shipment.count({ where: { reception_center_id: center.id }, transaction }) },
        { label: 'insumos ubicados en el centro', count: await Item.count({ where: { current_center_id: center.id }, transaction }) },
        {
          label: 'transferencias',
          count: await TokenTransfer.count({
            where: { [Op.or]: [{ from_center_id: center.id }, { to_center_id: center.id }] }, transaction,
          }),
        },
      ],
    });
  } catch (error) { return next(error); }
};
exports.getInventory = async (req, res, next) => {
  try {
    const center = await Center.findByPk(req.params.id);
    if (!center) return res.status(404).json({ error: 'Centro no encontrado' });
    return res.json({ center_id: center.id, center_name: center.name, items: await Item.findAll() });
  } catch (error) { return next(error); }
};
