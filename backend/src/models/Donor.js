const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('Donante', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(150), allowNull: false },
  contact: { type: DataTypes.STRING(255), allowNull: false },
  city: { type: DataTypes.STRING(120), allowNull: false },
  registered_by: { type: DataTypes.INTEGER, allowNull: false },
}, { tableName: 'donantes', timestamps: false });
