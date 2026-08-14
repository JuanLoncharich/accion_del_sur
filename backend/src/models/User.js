const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const sequelize = require('../config/database');

const ROLES = ['VOLUNTARIO', 'ADMINISTRADOR'];

const User = sequelize.define('Usuario', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  email: {
    type: DataTypes.STRING(255), allowNull: false, unique: true,
    validate: { isEmail: true },
  },
  password: { type: DataTypes.STRING(255), allowNull: false },
  role: {
    type: DataTypes.ENUM(...ROLES), allowNull: false, defaultValue: 'VOLUNTARIO',
  },
}, {
  tableName: 'usuarios',
  timestamps: false,
  hooks: {
    beforeCreate: async (user) => { user.password = await User.hashPassword(user.password); },
    beforeUpdate: async (user) => {
      if (user.changed('password')) user.password = await User.hashPassword(user.password);
    },
  },
});

User.ROLES = ROLES;
User.hashPassword = (password) => bcrypt.hash(password, 10);
User.prototype.validatePassword = function validatePassword(password) {
  return bcrypt.compare(password, this.password);
};
User.prototype.iniciarSesion = function iniciarSesion(password) {
  return this.validatePassword(password);
};
User.prototype.cerrarSesion = function cerrarSesion() { return true; };

module.exports = User;
