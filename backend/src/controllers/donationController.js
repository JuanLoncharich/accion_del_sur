const { Op } = require('sequelize');
const { Donation, Donor, Item, Category, Center, User, sequelize } = require('../models');

exports.create = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const quantity = Number(req.body.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) throw Object.assign(new Error('Cantidad inválida'), { status: 400 });
    const category = await Category.findByPk(req.body.category_id, { transaction });
    if (!category) throw Object.assign(new Error('Categoría no encontrada'), { status: 404 });

    // Nombre/descripción del ítem (requerido para crear el Insumo). Default si no viene.
    const itemName = (req.body.name || req.body.item_name || '').toString().trim() || `Donación ${category.name}`;
    const centerId = req.body.center_id ? Number(req.body.center_id) : null;

    // Donante: anónimo si no viene email.
    const contact = req.body.donor_email || req.body.contact || 'anonimo@sin-email.local';
    const [donor] = await Donor.findOrCreate({
      where: { contact },
      defaults: {
        name: req.body.donor_name || (contact === 'anonimo@sin-email.local' ? 'Donante anónimo' : contact),
        city: req.body.city || 'Sin especificar',
        registered_by: req.user.id,
      },
      transaction,
    });

    let item = await Item.findOne({ where: { category_id: category.id, name: itemName }, transaction, lock: transaction.LOCK.UPDATE });
    if (!item) {
      item = await Item.create(
        { category_id: category.id, name: itemName, available_quantity: 0, current_center_id: centerId, is_active: true },
        { transaction }
      );
    } else if (centerId && item.current_center_id !== centerId) {
      // Si la donación indica un centro, ubicamos ahí al ítem.
      item.current_center_id = centerId;
    }
    await item.actualizarStock(quantity, { transaction });
    if (item.changed()) await item.save({ transaction });

    const donation = await Donation.create(
      { date: req.body.date || new Date(), donor_id: donor.id, registered_by: req.user.id, status: 'confirmada' },
      { transaction }
    );
    // Guarda la cantidad en el join donaciones_insumos.
    await donation.addSupply(item, { through: { quantity }, transaction });

    await transaction.commit();
    res.status(201).json({
      id: donation.id,
      date: donation.date,
      quantity,
      item: { ...item.toJSON(), quantity: item.available_quantity },
      donor,
    });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    if (error.status) return res.status(error.status).json({ error: error.message });
    return next(error);
  }
};

exports.list = async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 20, 500);
    const where = {};
    if (req.query.from || req.query.to) {
      where.date = {};
      if (req.query.from) where.date[Op.gte] = req.query.from;
      if (req.query.to) where.date[Op.lte] = req.query.to;
    }
    const { count, rows } = await Donation.findAndCountAll({
      where,
      include: [
        { model: Donor, as: 'donor' },
        {
          model: Item, as: 'supplies', through: { attributes: ['quantity'] },
          include: [{ model: Category, as: 'category' }, { model: Center, as: 'currentCenter' }],
        },
        { model: User, as: 'registeredBy', attributes: ['id', 'email'] },
      ],
      order: [['date', 'DESC']], limit, offset: (page - 1) * limit, distinct: true,
    });

    // Aplanamos para que el frontend (Historial/Dashboard) lea item/quantity/center/status/created_at.
    const data = rows.map((d) => {
      const supply = d.supplies && d.supplies[0];
      const joinQty = supply ? Number((supply.DonacionInsumo && supply.DonacionInsumo.quantity) || 0) : 0;
      return {
        ...d.toJSON(),
        item: supply ? { id: supply.id, name: supply.name, category: supply.category } : null,
        quantity: joinQty,
        category_name: supply && supply.category ? supply.category.name : null,
        item_name: supply ? supply.name : null,
        center: supply && supply.currentCenter ? { id: supply.currentCenter.id, name: supply.currentCenter.name }
          : (d.donor ? { name: d.donor.city } : null),
        center_name: supply && supply.currentCenter ? supply.currentCenter.name : (d.donor ? d.donor.city : null),
        status: d.status || 'confirmada',
        created_at: d.date,
      };
    });

    res.json({ total: count, page, data });
  } catch (error) { next(error); }
};

exports.stats = async (req, res, next) => {
  try { res.json({ totalDonations: await Donation.count(), weeklyDonations: [] }); }
  catch (error) { next(error); }
};
