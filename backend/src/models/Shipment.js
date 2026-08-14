const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Shipment = sequelize.define('Envio', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  reception_center_id: { type: DataTypes.INTEGER, allowNull: false },
  registered_by: { type: DataTypes.INTEGER, allowNull: false },
  confirmed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, { tableName: 'envios', timestamps: false });

Shipment.prototype.confirmarEnvio = async function confirmarEnvio(options = {}) {
  if (this.confirmed) return this;
  const transaction = options.transaction || await sequelize.transaction();
  const ownsTransaction = !options.transaction;
  try {
    const details = await this.getDetails({ transaction });
    for (const detail of details) {
      const supply = await detail.getSupply({ transaction, lock: transaction.LOCK.UPDATE });
      await supply.actualizarStock(-detail.quantity_sent, { transaction });
    }
    this.confirmed = true;
    await this.save({ transaction });
    if (ownsTransaction) await transaction.commit();
    return this;
  } catch (error) {
    if (ownsTransaction) await transaction.rollback();
    throw error;
  }
};

module.exports = Shipment;
