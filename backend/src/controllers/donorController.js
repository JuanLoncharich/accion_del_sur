const { Donor } = require('../models');

exports.list = async (req, res, next) => {
  try {
    const donors = await Donor.findAll({
      attributes: ['id', 'name', 'contact', 'city'],
      order: [['name', 'ASC']],
    });
    res.json({ data: donors });
  } catch (error) { next(error); }
};

exports.create = async (req, res, next) => {
  try {
    const { name, contact, city } = req.body;
    if (!name || !contact) return res.status(400).json({ error: 'Nombre y contacto son requeridos' });
    const [donor] = await Donor.findOrCreate({
      where: { contact },
      defaults: { name, city: city || 'Sin especificar', registered_by: req.user.id },
    });
    res.status(201).json(donor);
  } catch (error) { next(error); }
};
