const sequelize = require('../config/database');
const User = require('./User');
const Category = require('./Category');
const CategoryAttribute = require('./CategoryAttribute');
const Item = require('./Item');
const Donation = require('./Donation');
const Distribution = require('./Distribution');
const AuditAccessLog = require('./AuditAccessLog');
const DonationReception = require('./DonationReception');
const DonationReceptionDetail = require('./DonationReceptionDetail');

// Category <-> CategoryAttribute
Category.hasMany(CategoryAttribute, { foreignKey: 'category_id', as: 'attributes' });
CategoryAttribute.belongsTo(Category, { foreignKey: 'category_id', as: 'category' });

// Category <-> Item
Category.hasMany(Item, { foreignKey: 'category_id', as: 'items' });
Item.belongsTo(Category, { foreignKey: 'category_id', as: 'category' });

// Item <-> Donation
Item.hasMany(Donation, { foreignKey: 'item_id', as: 'donations' });
Donation.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });

// Item <-> Distribution
Item.hasMany(Distribution, { foreignKey: 'item_id', as: 'distributions' });
Distribution.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });

// User <-> Donation
User.hasMany(Donation, { foreignKey: 'registered_by', as: 'donations' });
Donation.belongsTo(User, { foreignKey: 'registered_by', as: 'registeredBy' });

// User <-> Distribution
User.hasMany(Distribution, { foreignKey: 'registered_by', as: 'distributions' });
Distribution.belongsTo(User, { foreignKey: 'registered_by', as: 'registeredBy' });

User.hasMany(DonationReception, { foreignKey: 'created_by', as: 'createdReceptions' });
DonationReception.belongsTo(User, { foreignKey: 'created_by', as: 'createdBy' });

User.hasMany(DonationReception, { foreignKey: 'finalized_by', as: 'finalizedReceptions' });
DonationReception.belongsTo(User, { foreignKey: 'finalized_by', as: 'finalizedBy' });

DonationReception.hasMany(DonationReceptionDetail, { foreignKey: 'reception_id', as: 'details' });
DonationReceptionDetail.belongsTo(DonationReception, { foreignKey: 'reception_id', as: 'reception' });

Item.hasMany(DonationReceptionDetail, { foreignKey: 'item_id', as: 'receptionDetails' });
DonationReceptionDetail.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });

Distribution.hasMany(AuditAccessLog, { foreignKey: 'distribution_id', as: 'auditAccessLogs' });
AuditAccessLog.belongsTo(Distribution, { foreignKey: 'distribution_id', as: 'distribution' });

User.hasMany(AuditAccessLog, { foreignKey: 'accessed_by', as: 'auditAccesses' });
AuditAccessLog.belongsTo(User, { foreignKey: 'accessed_by', as: 'accessedBy' });

module.exports = {
  sequelize,
  User,
  Category,
  CategoryAttribute,
  Item,
  Donation,
  Distribution,
  AuditAccessLog,
  DonationReception,
  DonationReceptionDetail,
};
