const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('DonacionInsumo', {
  donation_id: { type: DataTypes.INTEGER, primaryKey: true },
  supply_id: { type: DataTypes.INTEGER, primaryKey: true },
}, { tableName: 'donaciones_insumos', timestamps: false });
