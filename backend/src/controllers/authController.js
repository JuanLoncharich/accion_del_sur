const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const { User } = require('../models');

const publicUser = ({ id, email, role }) => ({ id, email, role });
const generateToken = (user) => jwt.sign(
  { id: user.id, email: user.email, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
);

exports.login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
    const { password } = req.body;
    const identifier = req.body.email || req.body.username;
    const email = identifier === 'admin' ? 'admin@acciondelsur.org' : identifier;
    const user = await User.findOne({ where: { email } });
    if (!user || !(await user.iniciarSesion(password))) {
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }
    return res.json({ token: generateToken(user), user: publicUser(user) });
  } catch (error) { return next(error); }
};

exports.me = (req, res) => res.json(publicUser(req.user));

exports.register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Datos inválidos', details: errors.array() });
    const { email, password, role = 'VOLUNTARIO' } = req.body;
    const user = await User.create({ email, password, role });
    return res.status(201).json(publicUser(user));
  } catch (error) { return next(error); }
};
