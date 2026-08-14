const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Item = sequelize.define('Insumo', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(200), allowNull: false },
  available_quantity: {
    type: DataTypes.INTEGER, allowNull: false, defaultValue: 0,
    validate: { min: 0 },
  },
  category_id: { type: DataTypes.INTEGER, allowNull: false },
}, { tableName: 'insumos', timestamps: false });

Item.prototype.actualizarStock = async function actualizarStock(quantity, options = {}) {
  const nextQuantity = this.available_quantity + Number(quantity);
  if (!Number.isInteger(nextQuantity) || nextQuantity < 0) {
    throw new Error('La cantidad disponible no puede ser negativa');
  }
  this.available_quantity = nextQuantity;
  return this.save(options);
};

module.exports = Item;
