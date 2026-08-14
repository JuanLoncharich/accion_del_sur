const { sequelize, Donation, Item, Shipment, ShipmentDetail, Center, Category } = require('../models');
const { QueryTypes } = require('sequelize');

class Dashboard {
  static calcularTotalDonaciones() { return Donation.count(); }
  static async calcularInsumosDisponibles() {
    return Number(await Item.sum('available_quantity')) || 0;
  }
  static calcularEnviosRealizados() { return Shipment.count({ where: { confirmed: true } }); }
  static async calcularDestinosAlcanzados() {
    return Center.count({
      distinct: true,
      col: 'id',
      include: [{ model: Shipment, as: 'shipments', required: true, where: { confirmed: true }, attributes: [] }],
    });
  }
}

const isoDate = (d) => d.toISOString().slice(0, 10);

// Completa las últimas 8 semanas (lunes a lunes) rellenando con ceros las que no tienen datos.
const buildLast8Weeks = (rows) => {
  const map = new Map();
  for (const r of rows) {
    const key = String(r.week_start).slice(0, 10);
    map.set(key, { week_start: key, count: Number(r.count), total_quantity: Number(r.total_quantity) });
  }
  const out = [];
  const today = new Date();
  for (let i = 7; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i * 7);
    const day = d.getDay(); // 0=dom .. 6=sab
    const diff = day === 0 ? -6 : 1 - day; // llevar a lunes
    d.setDate(d.getDate() + diff);
    const ws = isoDate(d);
    out.push(map.get(ws) || { week_start: ws, count: 0, total_quantity: 0 });
  }
  return out;
};

const flatRecentDonations = async (limit) => {
  const rows = await Donation.findAll({
    include: [{
      model: Item, as: 'supplies', through: { attributes: ['quantity'] },
      include: [{ model: Category, as: 'category' }, { model: Center, as: 'currentCenter' }],
    }],
    order: [['date', 'DESC']], limit,
  });
  return rows.map((d) => {
    const s = d.supplies && d.supplies[0];
    const q = s ? Number((s.DonacionInsumo && s.DonacionInsumo.quantity) || 0) : 0;
    return {
      id: d.id,
      created_at: d.date,
      item_name: s ? s.name : null,
      category_name: s && s.category ? s.category.name : null,
      quantity: q,
    };
  });
};

const flatRecentDistributions = async (limit) => {
  const shipments = await Shipment.findAll({
    include: [
      { model: Center, as: 'destination' },
      { model: ShipmentDetail, as: 'details', include: [{ model: Item, as: 'supply', include: [{ model: Category, as: 'category' }] }] },
    ],
    order: [['date', 'DESC']], limit,
  });
  const out = [];
  for (const sh of shipments) {
    for (const det of (sh.details || [])) {
      out.push({
        id: `${sh.id}-${det.id}`,
        created_at: sh.date,
        item_name: det.supply ? det.supply.name : null,
        category_name: det.supply && det.supply.category ? det.supply.category.name : null,
        quantity: Number(det.quantity_sent || 0),
      });
    }
  }
  return out.slice(0, limit);
};

exports.summary = async (req, res, next) => {
  try {
    const [totalDonations, availableSupplies, completedShipments, reachedDestinations, activeCategories, supplies] = await Promise.all([
      Dashboard.calcularTotalDonaciones(),
      Dashboard.calcularInsumosDisponibles(),
      Dashboard.calcularEnviosRealizados(),
      Dashboard.calcularDestinosAlcanzados(),
      Category.count(),
      Item.findAll({
        attributes: ['available_quantity'],
        include: [{ model: Category, as: 'category', attributes: ['name'] }],
      }),
    ]);
    const stockTotals = new Map();
    for (const supply of supplies) {
      const category = supply.category?.name || 'Sin categoría';
      stockTotals.set(category, (stockTotals.get(category) || 0) + Number(supply.available_quantity));
    }

    const weeklyRows = await sequelize.query(
      `SELECT DATE_SUB(d.date, INTERVAL WEEKDAY(d.date) DAY) AS week_start,
              COUNT(DISTINCT d.id) AS count,
              COALESCE(SUM(di.quantity), 0) AS total_quantity
         FROM donaciones d
         LEFT JOIN donaciones_insumos di ON di.donation_id = d.id
        WHERE d.date >= CURDATE() - INTERVAL 8 WEEK
        GROUP BY week_start
        ORDER BY week_start ASC`,
      { type: QueryTypes.SELECT }
    );

    const [recentDonations, recentDistributions] = await Promise.all([
      flatRecentDonations(5),
      flatRecentDistributions(5),
    ]);

    res.json({
      summary: {
        totalDonations,
        totalItemsInStock: availableSupplies,
        totalDistributions: completedShipments,
        activeCategories,
        reachedDestinations,
      },
      stockByCategory: Array.from(stockTotals, ([category, total]) => ({ category, total })),
      weeklyDonations: buildLast8Weeks(weeklyRows),
      recentDonations,
      recentDistributions,
    });
  } catch (error) { next(error); }
};

exports.Dashboard = Dashboard;
