const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('DetalleEnvio', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  shipment_id: { type: DataTypes.INTEGER, allowNull: false },
  supply_id: { type: DataTypes.INTEGER, allowNull: false },
  quantity_sent: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
}, { tableName: 'detalles_envio', timestamps: false });
