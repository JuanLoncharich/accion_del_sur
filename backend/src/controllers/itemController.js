const { Op } = require('sequelize');
const { validationResult } = require('express-validator');
const {
  Item, Category, Center, Donation, DonationSupply, Shipment, ShipmentDetail, TokenTransfer, Reception, ReceptionDetail,
} = require('../models');
const stellarService = require('../services/blockchain/stellarService');
const sftService = require('../services/blockchain/sftService');
const { destroyIfUnused } = require('../utils/deleteGuard');

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
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 500);
    const where = {};
    if (req.query.search) where.name = { [Op.like]: `%${req.query.search}%` };
    if (req.query.category_id) where.category_id = req.query.category_id;
    if (req.query.status) where.status = req.query.status;
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
// PATCH /api/items/:id/status  { status: RECIBIDO | PREPARADO | DISPONIBLE }
exports.updateStatus = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
    const item = await Item.findByPk(req.params.id);
    if (!item) return res.status(404).json({ error: 'Insumo no encontrado' });
    await item.update({ status: req.body.status });
    return res.json(serialize(await Item.findByPk(item.id, { include })));
  } catch (error) { return next(error); }
};
exports.deactivate = async (req, res, next) => {
  try {
    return await destroyIfUnused(res, {
      model: Item,
      id: req.params.id,
      entity: 'el insumo',
      notFound: 'Insumo no encontrado',
      deleted: 'Insumo eliminado',
      dependencies: async (item, transaction) => [
        { label: 'líneas de donación', count: await DonationSupply.count({ where: { supply_id: item.id }, transaction }) },
        { label: 'detalles de envío', count: await ShipmentDetail.count({ where: { supply_id: item.id }, transaction }) },
        { label: 'transferencias', count: await TokenTransfer.count({ where: { item_id: item.id }, transaction }) },
        { label: 'detalles de recepción', count: await ReceptionDetail.count({ where: { item_id: item.id }, transaction }) },
      ],
    });
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

// GET /api/items/:id/trazabilidad
// Línea de tiempo del insumo (desde la base, con el hash de cada transacción on-chain) y
// verificación en vivo: saldo SFT del centro actual vs. stock registrado en la base.
exports.trazabilidad = async (req, res, next) => {
  try {
    const item = await Item.findByPk(req.params.id, {
      include: [{ model: Category, as: 'category' }, { model: Center, as: 'currentCenter' }],
    });
    if (!item) return res.status(404).json({ error: 'Insumo no encontrado' });

    const [donaciones, recepciones, transferencias, envios] = await Promise.all([
      DonationSupply.findAll({ where: { supply_id: item.id } }).then((rows) => Donation.findAll({
        where: { id: rows.map((r) => r.donation_id) },
      }).then((ds) => ds.map((d) => ({
        tipo: 'donacion',
        fecha: d.date,
        cantidad: Number(rows.find((r) => r.donation_id === d.id).quantity),
        detalle: `Donación #${d.id}`,
        blockchain_status: d.blockchain_status,
        tx: d.blockchain_tx,
      })))),
      ReceptionDetail.findAll({
        where: { item_id: item.id },
        include: [{ model: Reception, as: 'reception', include: [{ model: Center, as: 'center' }] }],
      }).then((rows) => rows.filter((r) => r.quantity_accepted > 0).map((r) => ({
        tipo: 'recepcion',
        fecha: r.reception.updated_at,
        cantidad: Number(r.quantity_accepted),
        detalle: `Recepción con QR #${r.reception.id}${r.reception.center ? ` en ${r.reception.center.name}` : ''}`,
        blockchain_status: r.reception.blockchain_tx ? 'anchored' : (r.reception.status === 'pending' ? null : 'local'),
        tx: r.reception.blockchain_tx,
      }))),
      TokenTransfer.findAll({
        where: { item_id: item.id },
        include: [{ model: Center, as: 'fromCenter' }, { model: Center, as: 'toCenter' }],
      }).then((rows) => rows.map((t) => ({
        tipo: 'transferencia',
        fecha: t.created_at,
        cantidad: Number(t.quantity),
        detalle: `${t.fromCenter ? t.fromCenter.name : '?'} → ${t.toCenter ? t.toCenter.name : '?'}`,
        blockchain_status: t.status,
        tx: t.egreso_blockchain_tx,
      }))),
      ShipmentDetail.findAll({
        where: { supply_id: item.id },
        include: [{ model: Shipment, as: 'shipment', where: { confirmed: true }, include: [{ model: Center, as: 'destination' }] }],
      }).then((rows) => rows.map((d) => ({
        tipo: 'envio',
        fecha: d.shipment.date,
        cantidad: -Number(d.quantity_sent),
        detalle: `Envío #${d.shipment.id} a ${d.shipment.destination ? d.shipment.destination.name : '?'}`,
        blockchain_status: d.shipment.blockchain_status,
        tx: d.blockchain_tx,
      }))),
    ]);

    const eventos = [...donaciones, ...recepciones, ...transferencias, ...envios]
      .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    const center = item.currentCenter;
    let verificacion = { disponible: false, motivo: 'La blockchain está desactivada (STELLAR_ENABLED=false).' };
    if (sftService.isEnabled && center && center.blockchain_contract_id) {
      try {
        const saldo = await sftService.getBalance(center.blockchain_contract_id, item.id);
        verificacion = {
          disponible: true,
          saldo_onchain: saldo,
          stock_base: item.available_quantity,
          coincide: saldo === item.available_quantity,
        };
      } catch (error) {
        verificacion = { disponible: false, motivo: `No se pudo consultar la blockchain: ${error.message}` };
      }
    } else if (sftService.isEnabled) {
      verificacion = { disponible: false, motivo: 'El centro del insumo no tiene contrato desplegado.' };
    }

    return res.json({
      item: { id: item.id, name: item.name, category: item.category ? item.category.name : null, stock: item.available_quantity },
      token_id: item.token_id || sftService.computeTokenId(item.id),
      centro: center ? { id: center.id, name: center.name, contrato: center.blockchain_contract_id } : null,
      contrato_sft: sftService.sftContractId,
      red: stellarService.networkName,
      verificacion,
      eventos,
    });
  } catch (error) { return next(error); }
};

