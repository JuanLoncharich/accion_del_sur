const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const STATUSES = ['RECIBIDO', 'PREPARADO', 'DISPONIBLE'];

const Item = sequelize.define('Insumo', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(200), allowNull: false },
  available_quantity: {
    type: DataTypes.INTEGER, allowNull: false, defaultValue: 0,
    validate: { min: 0 },
  },
  category_id: { type: DataTypes.INTEGER, allowNull: false },
  // Ubicación actual del insumo (centro que lo posee). NULL hasta que ingresa a un centro.
  current_center_id: { type: DataTypes.INTEGER, allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  // Estado logístico: RECIBIDO → PREPARADO → DISPONIBLE. Solo DISPONIBLE puede enviarse.
  status: { type: DataTypes.ENUM(...STATUSES), allowNull: false, defaultValue: 'RECIBIDO' },
  // Trazabilidad blockchain (SFT). token_id = SHA256(item_id); se completa al mintear.
  token_id: { type: DataTypes.STRING(64), allowNull: true },
  attributes_hash: { type: DataTypes.STRING(64), allowNull: true },
}, { tableName: 'insumos', timestamps: false });

Item.prototype.actualizarStock = async function actualizarStock(quantity, options = {}) {
  const nextQuantity = this.available_quantity + Number(quantity);
  if (!Number.isInteger(nextQuantity) || nextQuantity < 0) {
    throw new Error('La cantidad disponible no puede ser negativa');
  }
  this.available_quantity = nextQuantity;
  return this.save(options);
};

Item.STATUSES = STATUSES;

module.exports = Item;
