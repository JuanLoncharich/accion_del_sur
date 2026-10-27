const { Op } = require('sequelize');
const {
  Donation, DonationSupply, Item, Category, Center, Shipment, ShipmentDetail, TokenTransfer,
} = require('../models');
const { fn, col, literal } = require('sequelize');
const stellarService = require('../services/blockchain/stellarService');
const sftService = require('../services/blockchain/sftService');

// Endpoints públicos de la landing. Solo datos agregados o de inventario: nunca donantes,
// usuarios ni datos personales.

const COLOR_PALETTE = ['#E34E26', '#2E4053', '#1B2631', '#B9A48E', '#D5DBDB', '#7B8A8B'];

// Unidades donadas por categoría, con su porcentaje (para el gráfico de la landing).
const categoryBreakdown = async () => {
  const rows = await DonationSupply.findAll({
    attributes: [[col('supply.category.name'), 'name'], [fn('SUM', col('DonacionInsumo.quantity')), 'total']],
    include: [{ model: Item, as: 'supply', attributes: [], include: [{ model: Category, as: 'category', attributes: [] }] }],
    group: ['supply.category.id', 'supply.category.name'],
    order: [[literal('total'), 'DESC']],
    raw: true,
  });
  const total = rows.reduce((a, r) => a + Number(r.total || 0), 0);
  return rows.filter((r) => Number(r.total) > 0).map((r, i) => ({
    name: r.name,
    quantity: Number(r.total),
    value: total ? Math.round((Number(r.total) / total) * 100) : 0,
    color: COLOR_PALETTE[i % COLOR_PALETTE.length],
  }));
};

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
      summary: {
        totalDonations, activeCenters, unitsInStock, unitsShipped, destinationsReached, anchoredOperations: anchored,
        // Nombres que usa la landing (BlockchainTrazabilidad.jsx).
        beneficiariesReached: destinationsReached,
        deliveredVolume: unitsShipped,
      },
      categoryBreakdown: await categoryBreakdown(),
      tickerFacts: [
        `${totalDonations} donaciones registradas`,
        `${activeCenters} centros activos`,
        `${destinationsReached} destinos alcanzados`,
        `${unitsShipped} unidades enviadas`,
        `${anchored} operaciones verificables en blockchain`,
      ],
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

// GET /api/landing/centers-ranking
// Centros activos ordenados por cantidad de movimientos (donaciones recibidas y envíos).
exports.centersRanking = async (req, res, next) => {
  try {
    const centers = await Center.findAll({ where: { is_active: true }, attributes: ['id', 'name', 'location'] });
    const [donaciones, envios] = await Promise.all([
      DonationSupply.findAll({
        attributes: [[col('supply.current_center_id'), 'center_id'], [fn('COUNT', col('DonacionInsumo.donation_id')), 'n']],
        include: [{ model: Item, as: 'supply', attributes: [] }],
        group: ['supply.current_center_id'], raw: true,
      }),
      Shipment.findAll({ attributes: ['reception_center_id', [fn('COUNT', col('id')), 'n']], group: ['reception_center_id'], raw: true }),
    ]);
    const cuenta = new Map();
    donaciones.forEach((r) => cuenta.set(Number(r.center_id), (cuenta.get(Number(r.center_id)) || 0) + Number(r.n)));
    envios.forEach((r) => cuenta.set(Number(r.reception_center_id), (cuenta.get(Number(r.reception_center_id)) || 0) + Number(r.n)));
    const data = centers
      .map((c) => ({ id: c.id, name: c.name, processed: cuenta.get(c.id) || 0, locationLabel: c.location || 'Ubicación no disponible' }))
      .sort((a, b) => b.processed - a.processed || a.name.localeCompare(b.name))
      .slice(0, 8);
    res.json({ rankingBasis: 'movements_count', data, generatedAt: new Date().toISOString() });
  } catch (error) { next(error); }
};
