const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Distribution = sequelize.define('Distribution', {
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
  receiver_identifier: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  receiver_hash: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('draft', 'identified', 'signed', 'pending_anchor', 'anchored', 'failed'),
    allowNull: false,
    defaultValue: 'draft',
  },
  nonce: {
    type: DataTypes.STRING(120),
    allowNull: true,
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  identity_capture_method: {
    type: DataTypes.ENUM('manual'),
    allowNull: true,
  },
  assurance_level: {
    type: DataTypes.ENUM('MANUAL_VERIFIED'),
    allowNull: true,
  },
  recipient_commitment: {
    type: DataTypes.STRING(64),
    allowNull: true,
  },
  recipient_salt: {
    type: DataTypes.STRING(128),
    allowNull: true,
  },
  signature_data: {
    type: DataTypes.TEXT('long'),
    allowNull: true,
  },
  signature_mime: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  signature_hash: {
    type: DataTypes.STRING(64),
    allowNull: true,
  },
  receipt_payload: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  receipt_hash: {
    type: DataTypes.STRING(64),
    allowNull: true,
  },
  blockchain_tx_id: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  finalized_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  capture_terminal: {
    type: DataTypes.STRING(120),
    allowNull: true,
  },
  capture_ip: {
    type: DataTypes.STRING(120),
    allowNull: true,
  },
  capture_device: {
    type: DataTypes.STRING(255),
    allowNull: true,
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
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  registered_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  blockchain_hash: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
}, {
  tableName: 'distributions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
});

module.exports = Distribution;
