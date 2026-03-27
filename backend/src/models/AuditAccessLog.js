const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AuditAccessLog = sequelize.define('AuditAccessLog', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  distribution_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  access_type: {
    type: DataTypes.ENUM('public', 'internal'),
    allowNull: false,
  },
  accessed_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  purpose: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  requester_ip: {
    type: DataTypes.STRING(120),
    allowNull: true,
  },
  requester_device: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  external_reference: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
}, {
  tableName: 'audit_access_log',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
});

module.exports = AuditAccessLog;
