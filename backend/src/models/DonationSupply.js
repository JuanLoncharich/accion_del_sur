const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('DonacionInsumo', {
  donation_id: { type: DataTypes.INTEGER, primaryKey: true },
  supply_id: { type: DataTypes.INTEGER, primaryKey: true },
  quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, validate: { min: 1 } },
}, { tableName: 'donaciones_insumos', timestamps: false });
