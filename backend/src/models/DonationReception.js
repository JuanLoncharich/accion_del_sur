const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DonationReception = sequelize.define('DonationReception', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  public_token_qr: {
    type: DataTypes.STRING(128),
    allowNull: false,
    unique: true,
  },
  donor_email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      isEmail: true,
    },
  },
  donor_email_salt: {
    type: DataTypes.STRING(64),
    allowNull: false,
  },
  donor_email_hash: {
    type: DataTypes.STRING(64),
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('processing', 'completed', 'partially_rejected', 'rejected', 'failed_anchor'),
    allowNull: false,
    defaultValue: 'processing',
  },
  rejection_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  anchored_tx_id: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  anchored_hash: {
    type: DataTypes.STRING(64),
    allowNull: true,
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  finalized_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  finalized_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'donation_receptions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
});

module.exports = DonationReception;