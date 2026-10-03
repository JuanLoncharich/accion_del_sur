const { validationResult } = require('express-validator');
const { User, Donation, Donor, Center, Shipment, TokenTransfer } = require('../models');
const { destroyIfUnused } = require('../utils/deleteGuard');

const publicUser = ({ id, email, role }) => ({ id, email, role });

exports.list = async (req, res, next) => {
  try { res.json(await User.findAll({ attributes: ['id', 'email', 'role'], order: [['id', 'DESC']] })); }
  catch (error) { next(error); }
};

exports.create = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
    const user = await User.create({
      email: req.body.email,
      password: req.body.password,
      role: req.body.role || 'VOLUNTARIO',
    });
    return res.status(201).json(publicUser(user));
  } catch (error) { return next(error); }
};

exports.update = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const updates = {};
    for (const field of ['email', 'password', 'role']) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    await user.update(updates);
    return res.json(publicUser(user));
  } catch (error) { return next(error); }
};

exports.remove = async (req, res, next) => {
  try {
    return await destroyIfUnused(res, {
      model: User,
      id: req.params.id,
      entity: 'el usuario',
      notFound: 'Usuario no encontrado',
      deleted: 'Usuario eliminado',
      beforeDestroy: (user) => (user.id === req.user.id
        ? { status: 400, error: 'No podés eliminar tu propio usuario' }
        : null),
      dependencies: async (user, transaction) => [
        { label: 'donaciones registradas', count: await Donation.count({ where: { registered_by: user.id }, transaction }) },
        { label: 'donantes registrados', count: await Donor.count({ where: { registered_by: user.id }, transaction }) },
        { label: 'centros a cargo', count: await Center.count({ where: { managed_by: user.id }, transaction }) },
        { label: 'envíos registrados', count: await Shipment.count({ where: { registered_by: user.id }, transaction }) },
        { label: 'transferencias registradas', count: await TokenTransfer.count({ where: { transferred_by: user.id }, transaction }) },
      ],
    });
  } catch (error) { return next(error); }
};
