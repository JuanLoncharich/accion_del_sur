const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TokenTransfer = sequelize.define('TokenTransfer', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  item_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  from_center_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  to_center_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  reason: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  egreso_blockchain_hash: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  egreso_blockchain_tx: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  ingreso_blockchain_hash: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  ingreso_blockchain_tx: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('pending', 'anchored', 'failed'),
    defaultValue: 'pending',
  },
  transferred_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  tableName: 'token_transfers',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
});

module.exports = TokenTransfer;
