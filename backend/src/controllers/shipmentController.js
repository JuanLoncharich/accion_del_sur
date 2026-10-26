const { Op } = require('sequelize');
const { validationResult } = require('express-validator');
const { Shipment, ShipmentDetail, Center, Item, Category, User, sequelize } = require('../models');
const anclaje = require('../services/blockchain/anclaje');

const include = [
  { model: Center, as: 'destination', attributes: ['id', 'name', 'location'] },
  { model: User, as: 'registeredBy', attributes: ['id', 'email'] },
  {
    model: ShipmentDetail, as: 'details',
    include: [{ model: Item, as: 'supply', attributes: ['id', 'name', 'available_quantity'], include: [{ model: Category, as: 'category', attributes: ['id', 'name'] }] }],
  },
];

const findFull = (id, options = {}) => Shipment.findByPk(id, { include, ...options });

// Después de confirmar (y commitear) un envío: quema en blockchain las unidades de cada línea
// en el centro donde estaba el insumo. No falla el request si la blockchain no responde.
const anclarEnvio = async (shipmentId, operatorId) => {
  const shipment = await Shipment.findByPk(shipmentId, {
    include: [{
      model: ShipmentDetail, as: 'details',
      include: [{ model: Item, as: 'supply', include: [{ model: Center, as: 'currentCenter' }] }],
    }],
  });
  const resultados = [];
  for (const detail of shipment.details) {
    const r = await anclaje.quemarSalida({
      item: detail.supply,
      center: detail.supply.currentCenter,
      cantidad: detail.quantity_sent,
      referencia: `envio:${shipment.id}:destino:${shipment.reception_center_id}`,
      operatorId,
    });
    if (r.txId) await detail.update({ blockchain_tx: r.txId });
    resultados.push(r);
  }
  await shipment.update({ blockchain_status: anclaje.estadoConjunto(resultados) });
};

const sendError = (res, next, error) => (error.status
  ? res.status(error.status).json({ error: error.message, ...(error.payload || {}) })
  : next(error));

// GET /api/shipments?status=confirmed|pending&reception_center_id=&from=&to=&page=&limit=
exports.list = async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 500);
    const where = {};
    if (req.query.status === 'confirmed') where.confirmed = true;
    if (req.query.status === 'pending') where.confirmed = false;
    if (req.query.reception_center_id) where.reception_center_id = Number(req.query.reception_center_id);
    if (req.query.from || req.query.to) {
      where.date = {};
      if (req.query.from) where.date[Op.gte] = req.query.from;
      if (req.query.to) where.date[Op.lte] = req.query.to;
    }
    const { count, rows } = await Shipment.findAndCountAll({
      where, include, distinct: true,
      order: [['date', 'DESC'], ['id', 'DESC']],
      limit, offset: (page - 1) * limit,
    });
    res.json({ total: count, page, data: rows });
  } catch (error) { next(error); }
};

// GET /api/shipments/:id
exports.getById = async (req, res, next) => {
  try {
    const shipment = await findFull(req.params.id);
    return shipment ? res.json(shipment) : res.status(404).json({ error: 'Envío no encontrado' });
  } catch (error) { return next(error); }
};

// POST /api/shipments  { date?, reception_center_id, details: [{ supply_id, quantity_sent }], confirm? }
exports.create = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });

  const transaction = await sequelize.transaction();
  try {
    const center = await Center.findByPk(req.body.reception_center_id, { transaction });
    if (!center) throw Shipment.httpError(404, 'Centro de recepción no encontrado');

    const lines = Shipment.aggregateLines(req.body.details);
    // Valida existencia y stock aunque quede pendiente: no se registran envíos imposibles.
    await Shipment.lockAndCheckStock(lines.map((l) => ({ supply_id: l.supply_id, quantity_sent: l.quantity })), transaction);

    const shipment = await Shipment.create({
      date: req.body.date || new Date(),
      reception_center_id: center.id,
      registered_by: req.user.id,
      confirmed: false,
    }, { transaction });
    await ShipmentDetail.bulkCreate(
      lines.map((l) => ({ shipment_id: shipment.id, supply_id: l.supply_id, quantity_sent: l.quantity })),
      { transaction }
    );

    const confirm = req.body.confirm === true || req.body.confirm === 'true';
    if (confirm) await shipment.confirmarEnvio({ transaction });

    await transaction.commit();
    if (confirm) await anclarEnvio(shipment.id, req.user.id);
    return res.status(201).json(await findFull(shipment.id));
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return sendError(res, next, error);
  }
};

// POST /api/shipments/:id/confirm
exports.confirm = async (req, res, next) => {
  try {
    const shipment = await Shipment.findByPk(req.params.id);
    if (!shipment) return res.status(404).json({ error: 'Envío no encontrado' });
    await shipment.confirmarEnvio();
    await anclarEnvio(shipment.id, req.user.id);
    return res.json(await findFull(shipment.id));
  } catch (error) { return sendError(res, next, error); }
};

// DELETE /api/shipments/:id  (solo pendientes)
exports.remove = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const shipment = await Shipment.findByPk(req.params.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!shipment) throw Shipment.httpError(404, 'Envío no encontrado');
    if (shipment.confirmed) throw Shipment.httpError(409, 'No se puede eliminar un envío confirmado: el stock ya fue descontado');
    await shipment.destroy({ transaction });
    await transaction.commit();
    return res.json({ message: 'Envío eliminado' });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    return sendError(res, next, error);
  }
};
