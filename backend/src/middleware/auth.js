const jwt = require('jsonwebtoken');
const { User } = require('../models');

const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token de autenticación requerido' });
    const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    const user = await User.findByPk(decoded.id, { attributes: ['id', 'email', 'role'] });
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
    req.user = user;
    return next();
  } catch (error) { return res.status(401).json({ error: 'Token inválido o expirado' }); }
};

const requireAdmin = (req, res, next) => req.user.role === 'ADMINISTRADOR'
  ? next()
  : res.status(403).json({ error: 'Acceso denegado. Se requiere rol administrador.' });

module.exports = { authenticate, requireAdmin };
