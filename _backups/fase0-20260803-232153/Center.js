const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('CentroRecepcion', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(120), allowNull: false },
  location: { type: DataTypes.STRING(255), allowNull: false },
  operational_status: { type: DataTypes.STRING(100), allowNull: false },
  managed_by: { type: DataTypes.INTEGER, allowNull: false },
}, { tableName: 'centros_recepcion', timestamps: false });
