const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DonationReceptionDetail = sequelize.define('DonationReceptionDetail', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  reception_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  item_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  quantity_received: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  quantity_accepted: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  quantity_rejected: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  rejection_reason_item: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'donation_reception_details',
  timestamps: false,
});

module.exports = DonationReceptionDetail;