const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('Categoria', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  parent_category_id: { type: DataTypes.INTEGER, allowNull: true },
}, { tableName: 'categorias', timestamps: false });
