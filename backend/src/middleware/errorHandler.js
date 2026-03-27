const errorHandler = (err, req, res, next) => {
  console.error('[Error]', err.stack || err.message);

  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      error: 'Error de validación',
      details: err.errors.map((e) => e.message),
    });
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({
      error: 'Ya existe un registro con esos datos',
    });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ error: 'Token inválido' });
  }

  const status = err.status || 500;
  const message = err.message || 'Error interno del servidor';

  res.status(status).json({ error: message });
};

module.exports = errorHandler;
