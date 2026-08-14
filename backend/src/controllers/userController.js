const { validationResult } = require('express-validator');
const { User } = require('../models');

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
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (user.id === req.user.id) return res.status(400).json({ error: 'No podés eliminar tu propio usuario' });
    await user.destroy();
    return res.json({ message: 'Usuario eliminado' });
  } catch (error) { return next(error); }
};
