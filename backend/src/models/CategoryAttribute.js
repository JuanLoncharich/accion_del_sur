const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CategoryAttribute = sequelize.define('CategoryAttribute', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  category_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  attribute_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  attribute_type: {
    type: DataTypes.ENUM('text', 'number', 'date', 'select'),
    allowNull: false,
    defaultValue: 'text',
  },
  options: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  is_required: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  display_order: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
}, {
  tableName: 'category_attributes',
  timestamps: false,
});

module.exports = CategoryAttribute;
