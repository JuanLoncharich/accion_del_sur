const { validationResult } = require('express-validator');
const { User } = require('../models');

exports.list = async (req, res, next) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'username', 'email', 'role', 'created_at'],
      order: [['created_at', 'DESC']],
    });
    res.json(users);
  } catch (error) {
    next(error);
  }
};

exports.create = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
    }

    const { username, email, password, role } = req.body;
    const password_hash = await User.hashPassword(password);

    const user = await User.create({ username, email, password_hash, role: role || 'logistica' });

    res.status(201).json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const updates = { ...req.body };
    if (updates.password) {
      updates.password_hash = await User.hashPassword(updates.password);
      delete updates.password;
    }

    await user.update(updates);

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    next(error);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (user.id === req.user.id) {
      return res.status(400).json({ error: 'No podés eliminar tu propio usuario' });
    }

    await user.destroy();
    res.json({ message: 'Usuario eliminado' });
  } catch (error) {
    next(error);
  }
};
