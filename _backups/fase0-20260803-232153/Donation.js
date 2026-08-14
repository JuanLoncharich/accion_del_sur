const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('Donacion', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  donor_id: { type: DataTypes.INTEGER, allowNull: false },
  registered_by: { type: DataTypes.INTEGER, allowNull: false },
}, { tableName: 'donaciones', timestamps: false });
