const { Category, Center, Item } = require('../models');

// Las categorías con menos stock DISPONIBLE encabezan la lista; por debajo del umbral se marcan como críticas.
const PRIORITY_THRESHOLD = 20;
const PRIORITY_LIMIT = 6;

/**
 * GET /api/support-panel
 * Panel de apoyo de solo lectura:
 * - Insumos prioritarios: las categorías finales (sin subcategorías) con menor stock DISPONIBLE.
 * - Puntos de recepción activos: centros activos con su estado operativo.
 */
exports.get = async (req, res, next) => {
  try {
    const [categories, items, centers] = await Promise.all([
      Category.findAll({ attributes: ['id', 'name', 'parent_category_id'] }),
      Item.findAll({ where: { is_active: true, status: 'DISPONIBLE' }, attributes: ['category_id', 'available_quantity'] }),
      Center.findAll({ where: { is_active: true }, attributes: ['id', 'name', 'location', 'operational_status'], order: [['name', 'ASC']] }),
    ]);

    const byId = new Map(categories.map((c) => [c.id, c]));
    const parents = new Set(categories.map((c) => c.parent_category_id).filter(Boolean));
    const available = new Map();
    for (const item of items) available.set(item.category_id, (available.get(item.category_id) || 0) + item.available_quantity);

    const prioritySupplies = categories
      .filter((c) => !parents.has(c.id))
      .map((c) => ({
        category_id: c.id,
        category: c.name,
        parent: c.parent_category_id ? byId.get(c.parent_category_id)?.name || null : null,
        available: available.get(c.id) || 0,
      }))
      .sort((a, b) => a.available - b.available || a.category.localeCompare(b.category))
      .slice(0, PRIORITY_LIMIT)
      .map((c) => ({ ...c, critical: c.available < PRIORITY_THRESHOLD }));

    res.json({
      threshold: PRIORITY_THRESHOLD,
      prioritySupplies,
      receptionPoints: centers.map((c) => ({
        ...c.toJSON(),
        accepting: /^operativo/i.test(c.operational_status || ''),
      })),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) { next(error); }
};
