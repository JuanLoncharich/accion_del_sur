const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Donation = sequelize.define('Donation', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  item_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  center_name: {
    type: DataTypes.STRING(120),
    allowNull: true,
  },
  center_latitude: {
    type: DataTypes.DECIMAL(10, 7),
    allowNull: true,
  },
  center_longitude: {
    type: DataTypes.DECIMAL(10, 7),
    allowNull: true,
  },
  center_geo_hash: {
    type: DataTypes.STRING(64),
    allowNull: true,
  },
  blockchain_hash: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  blockchain_tx_id: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('pending', 'anchored', 'failed'),
    allowNull: false,
    defaultValue: 'pending',
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  center_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  registered_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  tableName: 'donations',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
});

module.exports = Donation;
