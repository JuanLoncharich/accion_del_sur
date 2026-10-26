const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Item = require('./Item');

const httpError = (status, message, payload) => Object.assign(new Error(message), { status, payload });

const Shipment = sequelize.define('Envio', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  reception_center_id: { type: DataTypes.INTEGER, allowNull: false },
  registered_by: { type: DataTypes.INTEGER, allowNull: false },
  confirmed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  // Anclaje on-chain al confirmar (burn SFT por línea): anchored | local | disabled.
  blockchain_status: { type: DataTypes.STRING(20), allowNull: true },
}, { tableName: 'envios', timestamps: false });

// Suma las cantidades por insumo: [{ supply_id, quantity }] ordenado por supply_id.
Shipment.aggregateLines = (lines) => {
  const totals = new Map();
  for (const line of lines) {
    const supplyId = Number(line.supply_id);
    totals.set(supplyId, (totals.get(supplyId) || 0) + Number(line.quantity_sent));
  }
  return Array.from(totals, ([supply_id, quantity]) => ({ supply_id, quantity }))
    .sort((a, b) => a.supply_id - b.supply_id);
};

// Bloquea los insumos (orden por id para evitar deadlocks) y verifica stock suficiente.
// Devuelve un Map supply_id → Item bloqueado. Lanza 404/409 con detalle.
Shipment.lockAndCheckStock = async (lines, transaction) => {
  const items = new Map();
  for (const { supply_id, quantity } of Shipment.aggregateLines(lines)) {
    const item = await Item.findByPk(supply_id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!item) throw httpError(404, `Insumo ${supply_id} no encontrado`, { supply_id });
    if (item.status !== 'DISPONIBLE') {
      throw httpError(409, `"${item.name}" no está DISPONIBLE (estado actual: ${item.status}); solo se pueden enviar insumos disponibles`, {
        supply_id, status: item.status,
      });
    }
    if (item.available_quantity < quantity) {
      throw httpError(409, `Stock insuficiente para "${item.name}"`, {
        supply_id, available: item.available_quantity, requested: quantity,
      });
    }
    items.set(supply_id, item);
  }
  return items;
};

/**
 * Confirma el envío y descuenta stock en una única transacción.
 * Bloquea la fila del envío para impedir una doble confirmación concurrente.
 */
Shipment.prototype.confirmarEnvio = async function confirmarEnvio(options = {}) {
  const transaction = options.transaction || await sequelize.transaction();
  const ownsTransaction = !options.transaction;
  try {
    const shipment = await Shipment.findByPk(this.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!shipment) throw httpError(404, 'Envío no encontrado');
    if (shipment.confirmed) throw httpError(409, 'El envío ya fue confirmado');

    const details = await shipment.getDetails({ transaction });
    if (!details.length) throw httpError(409, 'El envío no tiene detalles');
    const lines = details.map((d) => ({ supply_id: d.supply_id, quantity_sent: d.quantity_sent }));
    const items = await Shipment.lockAndCheckStock(lines, transaction);
    for (const { supply_id, quantity } of Shipment.aggregateLines(lines)) {
      await items.get(supply_id).actualizarStock(-quantity, { transaction });
    }

    shipment.confirmed = true;
    await shipment.save({ transaction });
    if (ownsTransaction) await transaction.commit();
    this.confirmed = true;
    return shipment;
  } catch (error) {
    if (ownsTransaction) await transaction.rollback();
    throw error;
  }
};

Shipment.httpError = httpError;

module.exports = Shipment;
