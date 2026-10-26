const { Op } = require('sequelize');
const {
  Donation, DonationSupply, Item, Category, Center, Shipment, ShipmentDetail, TokenTransfer,
} = require('../models');
const stellarService = require('../services/blockchain/stellarService');
const sftService = require('../services/blockchain/sftService');

// Endpoints públicos de la landing. Solo datos agregados o de inventario: nunca donantes,
// usuarios ni datos personales.

// GET /api/landing/summary
exports.summary = async (req, res, next) => {
  try {
    const [totalDonations, activeCenters, unitsInStock, unitsShipped, destinationsReached, anchored] = await Promise.all([
      Donation.count(),
      Center.count({ where: { is_active: true } }),
      Item.sum('available_quantity').then((v) => Number(v) || 0),
      ShipmentDetail.sum('quantity_sent', {
        include: [{ model: Shipment, as: 'shipment', where: { confirmed: true }, attributes: [] }],
      }).then((v) => Number(v) || 0),
      Center.count({ include: [{ model: Shipment, as: 'shipments', required: true, where: { confirmed: true }, attributes: [] }], distinct: true }),
      Promise.all([
        Donation.count({ where: { blockchain_status: 'anchored' } }),
        TokenTransfer.count({ where: { status: 'anchored' } }),
        Shipment.count({ where: { blockchain_status: 'anchored' } }),
      ]).then((counts) => counts.reduce((a, b) => a + b, 0)),
    ]);
    res.json({
      summary: { totalDonations, activeCenters, unitsInStock, unitsShipped, destinationsReached, anchoredOperations: anchored },
      blockchain: {
        enabled: sftService.isEnabled,
        network: stellarService.networkName,
        sftContract: sftService.sftContractId,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) { next(error); }
};

const ORDEN_FLUJO = { ingreso: 0, transferencia: 1, envio: 2 };

// GET /api/landing/recent-movements
// Últimas operaciones confirmadas en la blockchain, con su transacción.
exports.recentMovements = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 8, 20);
    const itemInclude = { model: Item, as: 'supply', attributes: ['name'], include: [{ model: Category, as: 'category', attributes: ['name'] }] };

    const [donaciones, transferencias, envios] = await Promise.all([
      Donation.findAll({
        where: { blockchain_status: 'anchored', blockchain_tx: { [Op.ne]: null } },
        order: [['id', 'DESC']], limit,
        include: [{
          model: Item, as: 'supplies', attributes: ['name'], through: { attributes: ['quantity'] },
          include: [{ model: Category, as: 'category', attributes: ['name'] }, { model: Center, as: 'currentCenter', attributes: ['name'] }],
        }],
      }),
      TokenTransfer.findAll({
        where: { status: 'anchored' }, order: [['id', 'DESC']], limit,
        include: [
          { model: Item, as: 'item', attributes: ['name'] },
          { model: Center, as: 'fromCenter', attributes: ['name'] },
          { model: Center, as: 'toCenter', attributes: ['name'] },
        ],
      }),
      ShipmentDetail.findAll({
        where: { blockchain_tx: { [Op.ne]: null } }, order: [['id', 'DESC']], limit,
        include: [itemInclude, { model: Shipment, as: 'shipment', attributes: ['date'], include: [{ model: Center, as: 'destination', attributes: ['name'] }] }],
      }),
    ]);

    const movimientos = [
      ...donaciones.map((d) => {
        const s = d.supplies[0];
        return {
          tipo: 'ingreso', fecha: d.date, cantidad: s ? Number(s.DonacionInsumo.quantity) : null,
          insumo: s ? s.name : null, categoria: s && s.category ? s.category.name : null,
          lugar: s && s.currentCenter ? s.currentCenter.name : null, tx: d.blockchain_tx,
        };
      }),
      ...transferencias.map((t) => ({
        tipo: 'transferencia', fecha: new Date(t.created_at).toISOString(), cantidad: t.quantity, insumo: t.item ? t.item.name : null,
        categoria: null, lugar: `${t.fromCenter ? t.fromCenter.name : '?'} → ${t.toCenter ? t.toCenter.name : '?'}`,
        tx: t.egreso_blockchain_tx,
      })),
      ...envios.map((e) => ({
        tipo: 'envio', fecha: e.shipment.date, cantidad: e.quantity_sent, insumo: e.supply ? e.supply.name : null,
        categoria: e.supply && e.supply.category ? e.supply.category.name : null,
        lugar: e.shipment.destination ? e.shipment.destination.name : null, tx: e.blockchain_tx,
      })),
    ]
      // Donaciones y envíos solo guardan el día: dentro del mismo día se ordena según el flujo
      // (lo último que pasa en el flujo, primero).
      .sort((a, b) => String(b.fecha).slice(0, 10).localeCompare(String(a.fecha).slice(0, 10))
        || ORDEN_FLUJO[b.tipo] - ORDEN_FLUJO[a.tipo])
      .slice(0, limit);

    res.json({ data: movimientos, network: stellarService.networkName, generatedAt: new Date().toISOString() });
  } catch (error) { next(error); }
};
