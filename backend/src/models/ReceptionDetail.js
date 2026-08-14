const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Detalle de una recepción: cantidades recibidas / aceptadas / rechazadas por ítem.
 * Es la base del anchor hash (ver utils/cryptoEvidence.buildReceptionAnchorHash).
 */
module.exports = sequelize.define('RecepcionDetalle', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  reception_id: { type: DataTypes.INTEGER, allowNull: false },
  item_id: { type: DataTypes.INTEGER, allowNull: false },
  quantity_received: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  quantity_accepted: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  quantity_rejected: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  rejection_reason_item: { type: DataTypes.STRING(255), allowNull: true },
}, { tableName: 'recepciones_detalles', timestamps: false });
