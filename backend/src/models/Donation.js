const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('Donacion', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  donor_id: { type: DataTypes.INTEGER, allowNull: false },
  registered_by: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'confirmada' },
  // Anclaje on-chain (mint SFT): anchored | local | disabled.
  blockchain_status: { type: DataTypes.STRING(20), allowNull: true },
  blockchain_tx: { type: DataTypes.STRING(128), allowNull: true },
}, { tableName: 'donaciones', timestamps: false });
