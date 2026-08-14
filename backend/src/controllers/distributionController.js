const { Shipment, ShipmentDetail, Center, Item, Category } = require('../models');

const unsupported = (req, res) => res.status(409).json({ error: 'El nuevo modelo utiliza envíos con detalles; este flujo legado no está disponible' });

exports.list = async (req, res, next) => {
  try {
    const rows = await Shipment.findAll({
      include: [
        { model: Center, as: 'destination' },
        { model: ShipmentDetail, as: 'details', include: [{ model: Item, as: 'supply', include: [{ model: Category, as: 'category' }] }] },
      ],
      order: [['date', 'DESC']],
    });

    // Aplanamos para que el Historial lea item/quantity/center/status/created_at,
    // manteniendo la forma original (destination + details[]) para Distribuciones.jsx.
    const data = rows.map((sh) => {
      const details = sh.details || [];
      const totalQty = details.reduce((acc, d) => acc + Number(d.quantity_sent || 0), 0);
      const first = details[0];
      return {
        ...sh.toJSON(),
        item: first && first.supply ? { id: first.supply.id, name: first.supply.name, category: first.supply.category } : null,
        item_name: first && first.supply ? first.supply.name : null,
        category_name: first && first.supply && first.supply.category ? first.supply.category.name : null,
        quantity: totalQty,
        center: sh.destination ? { id: sh.destination.id, name: sh.destination.name } : null,
        center_name: sh.destination ? sh.destination.name : null,
        status: sh.confirmed ? 'confirmada' : 'pendiente',
        created_at: sh.date,
      };
    });

    res.json({ total: rows.length, page: 1, data });
  } catch (error) { next(error); }
};

exports.stats = async (req, res, next) => {
  try { res.json({ totalDistributions: await Shipment.count({ where: { confirmed: true } }) }); }
  catch (error) { next(error); }
};

exports.create = unsupported;
exports.prepare = unsupported;
exports.identifyManual = unsupported;
exports.sign = unsupported;
exports.finalize = unsupported;
