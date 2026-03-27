const { validationResult } = require('express-validator');
const { Category, CategoryAttribute } = require('../models');

exports.list = async (req, res, next) => {
  try {
    const where = {};
    if (req.query.active !== 'false') where.is_active = true;

    const categories = await Category.findAll({
      where,
      include: [{ model: CategoryAttribute, as: 'attributes', order: [['display_order', 'ASC']] }],
      order: [['name', 'ASC']],
    });

    res.json(categories);
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

    const { name, description } = req.body;
    const category = await Category.create({ name, description });
    res.status(201).json(category);
  } catch (error) {
    next(error);
  }
};

exports.update = async (req, res, next) => {
  try {
    const category = await Category.findByPk(req.params.id);
    if (!category) return res.status(404).json({ error: 'Categoría no encontrada' });

    await category.update(req.body);
    res.json(category);
  } catch (error) {
    next(error);
  }
};

exports.deactivate = async (req, res, next) => {
  try {
    const category = await Category.findByPk(req.params.id);
    if (!category) return res.status(404).json({ error: 'Categoría no encontrada' });

    await category.update({ is_active: false });
    res.json({ message: 'Categoría desactivada' });
  } catch (error) {
    next(error);
  }
};

exports.getAttributes = async (req, res, next) => {
  try {
    const attrs = await CategoryAttribute.findAll({
      where: { category_id: req.params.id },
      order: [['display_order', 'ASC']],
    });
    res.json(attrs);
  } catch (error) {
    next(error);
  }
};

exports.addAttribute = async (req, res, next) => {
  try {
    const category = await Category.findByPk(req.params.id);
    if (!category) return res.status(404).json({ error: 'Categoría no encontrada' });

    const attr = await CategoryAttribute.create({
      ...req.body,
      category_id: req.params.id,
    });
    res.status(201).json(attr);
  } catch (error) {
    next(error);
  }
};

exports.updateAttribute = async (req, res, next) => {
  try {
    const attr = await CategoryAttribute.findOne({
      where: { id: req.params.attrId, category_id: req.params.id },
    });
    if (!attr) return res.status(404).json({ error: 'Atributo no encontrado' });

    await attr.update(req.body);
    res.json(attr);
  } catch (error) {
    next(error);
  }
};

exports.deleteAttribute = async (req, res, next) => {
  try {
    const attr = await CategoryAttribute.findOne({
      where: { id: req.params.attrId, category_id: req.params.id },
    });
    if (!attr) return res.status(404).json({ error: 'Atributo no encontrado' });

    await attr.destroy();
    res.json({ message: 'Atributo eliminado' });
  } catch (error) {
    next(error);
  }
};
