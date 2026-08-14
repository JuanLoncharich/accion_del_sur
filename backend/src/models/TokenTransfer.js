const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Transferencia de tokens (SFT) entre centros.
 * Registra el movimiento lógico + los hashes/tx de blockchain (cuando está activado).
 */
module.exports = sequelize.define('TransferenciaToken', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  item_id: { type: DataTypes.INTEGER, allowNull: false },
  from_center_id: { type: DataTypes.INTEGER, allowNull: false },
  to_center_id: { type: DataTypes.INTEGER, allowNull: false },
  quantity: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
  reason: { type: DataTypes.STRING(255), allowNull: true },
  status: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'pending' },
  transferred_by: { type: DataTypes.INTEGER, allowNull: false },
  token_id: { type: DataTypes.STRING(64), allowNull: true },
  egreso_blockchain_hash: { type: DataTypes.STRING(128), allowNull: true },
  egreso_blockchain_tx: { type: DataTypes.STRING(128), allowNull: true },
  ingreso_blockchain_hash: { type: DataTypes.STRING(128), allowNull: true },
  ingreso_blockchain_tx: { type: DataTypes.STRING(128), allowNull: true },
}, { tableName: 'transfers', timestamps: true, createdAt: 'created_at', updatedAt: false });
