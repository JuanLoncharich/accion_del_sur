const hits = new Map();

const windowMs = 60 * 1000;
const maxHits = 60;

const cleanup = () => {
  const now = Date.now();
  for (const [key, value] of hits.entries()) {
    if (now - value.windowStart > windowMs) {
      hits.delete(key);
    }
  }
};

setInterval(cleanup, windowMs).unref();

const publicRateLimit = (req, res, next) => {
  const key = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  const current = hits.get(key);

  if (!current || now - current.windowStart > windowMs) {
    hits.set(key, { count: 1, windowStart: now });
    return next();
  }

  if (current.count >= maxHits) {
    return res.status(429).json({ error: 'No se encontró la confirmación solicitada' });
  }

  current.count += 1;
  return next();
};

module.exports = { publicRateLimit };
