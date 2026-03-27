const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  username: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: { isEmail: true },
  },
  password_hash: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  role: {
    type: DataTypes.ENUM('admin', 'logistica'),
    allowNull: false,
    defaultValue: 'logistica',
  },
}, {
  tableName: 'users',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
});

User.prototype.validatePassword = async function (password) {
  return bcrypt.compare(password, this.password_hash);
};

User.hashPassword = async (password) => {
  return bcrypt.hash(password, 10);
};

module.exports = User;
