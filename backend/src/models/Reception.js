const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Recepción de donación con confirmación pública por QR + anclaje blockchain.
 * Flujo: createInitial (genera token público) → finalizeInternal (ancla + mintea) → getPublicByToken/verifyPublicAnchor.
 */
module.exports = sequelize.define('Recepcion', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  token: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  donor_email: { type: DataTypes.STRING(255), allowNull: true },
  donor_email_hash: { type: DataTypes.STRING(64), allowNull: true },
  salt: { type: DataTypes.STRING(64), allowNull: true },
  reception_center_id: { type: DataTypes.INTEGER, allowNull: true },
  status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'pending' },
  anchor_hash: { type: DataTypes.STRING(64), allowNull: true },
  signature_hash: { type: DataTypes.STRING(64), allowNull: true },
  rejection_reason: { type: DataTypes.STRING(255), allowNull: true },
  operator_id: { type: DataTypes.INTEGER, allowNull: true },
  blockchain_hash: { type: DataTypes.STRING(128), allowNull: true },
  blockchain_tx: { type: DataTypes.STRING(128), allowNull: true },
}, { tableName: 'recepciones', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });
