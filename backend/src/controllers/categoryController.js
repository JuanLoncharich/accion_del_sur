const { Category } = require('../models');

const serialize = (category) => ({ ...category.toJSON(), attributes: [], is_active: true });

exports.list = async (req, res, next) => {
  try { res.json((await Category.findAll({ order: [['name', 'ASC']] })).map(serialize)); }
  catch (error) { next(error); }
};
exports.create = async (req, res, next) => {
  try { res.status(201).json(serialize(await Category.create({ name: req.body.name, parent_category_id: req.body.parent_category_id || null }))); }
  catch (error) { next(error); }
};
exports.update = async (req, res, next) => {
  try {
    const category = await Category.findByPk(req.params.id);
    if (!category) return res.status(404).json({ error: 'Categoría no encontrada' });
    await category.update({ name: req.body.name ?? category.name, parent_category_id: req.body.parent_category_id ?? category.parent_category_id });
    return res.json(serialize(category));
  } catch (error) { return next(error); }
};
exports.deactivate = async (req, res, next) => {
  try {
    const category = await Category.findByPk(req.params.id);
    if (!category) return res.status(404).json({ error: 'Categoría no encontrada' });
    await category.destroy(); return res.json({ message: 'Categoría eliminada' });
  } catch (error) { return next(error); }
};
exports.getAttributes = (req, res) => res.json([]);
const noAttributes = (req, res) => res.status(409).json({ error: 'El nuevo modelo no define atributos de categoría' });
exports.addAttribute = noAttributes;
exports.updateAttribute = noAttributes;
exports.deleteAttribute = noAttributes;
