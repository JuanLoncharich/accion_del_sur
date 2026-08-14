const sequelize = require('../config/database');
const User = require('./User');
const Donor = require('./Donor');
const Donation = require('./Donation');
const Category = require('./Category');
const Item = require('./Item');
const Center = require('./Center');
const Shipment = require('./Shipment');
const ShipmentDetail = require('./ShipmentDetail');
const DonationSupply = require('./DonationSupply');

User.hasMany(Center, { foreignKey: 'managed_by', as: 'managedCenters' });
Center.belongsTo(User, { foreignKey: 'managed_by', as: 'manager' });

User.hasMany(Donor, { foreignKey: 'registered_by', as: 'registeredDonors' });
Donor.belongsTo(User, { foreignKey: 'registered_by', as: 'registeredBy' });

User.hasMany(Donation, { foreignKey: 'registered_by', as: 'registeredDonations' });
Donation.belongsTo(User, { foreignKey: 'registered_by', as: 'registeredBy' });
Donor.hasMany(Donation, { foreignKey: 'donor_id', as: 'donations' });
Donation.belongsTo(Donor, { foreignKey: 'donor_id', as: 'donor' });

Category.hasMany(Category, { foreignKey: 'parent_category_id', as: 'subcategories' });
Category.belongsTo(Category, { foreignKey: 'parent_category_id', as: 'parentCategory' });
Category.hasMany(Item, { foreignKey: 'category_id', as: 'supplies' });
Item.belongsTo(Category, { foreignKey: 'category_id', as: 'category' });

Donation.belongsToMany(Item, {
  through: DonationSupply, foreignKey: 'donation_id', otherKey: 'supply_id', as: 'supplies',
});
Item.belongsToMany(Donation, {
  through: DonationSupply, foreignKey: 'supply_id', otherKey: 'donation_id', as: 'donations',
});

User.hasMany(Shipment, { foreignKey: 'registered_by', as: 'registeredShipments' });
Shipment.belongsTo(User, { foreignKey: 'registered_by', as: 'registeredBy' });
Center.hasMany(Shipment, { foreignKey: 'reception_center_id', as: 'shipments' });
Shipment.belongsTo(Center, { foreignKey: 'reception_center_id', as: 'destination' });
Shipment.hasMany(ShipmentDetail, { foreignKey: 'shipment_id', as: 'details' });
ShipmentDetail.belongsTo(Shipment, { foreignKey: 'shipment_id', as: 'shipment' });
Item.hasMany(ShipmentDetail, { foreignKey: 'supply_id', as: 'shipmentDetails' });
ShipmentDetail.belongsTo(Item, { foreignKey: 'supply_id', as: 'supply' });

module.exports = {
  sequelize,
  User,
  Usuario: User,
  Donor,
  Donante: Donor,
  Donation,
  Donacion: Donation,
  Category,
  Categoria: Category,
  Item,
  Insumo: Item,
  Center,
  CentroRecepcion: Center,
  Shipment,
  Envio: Shipment,
  ShipmentDetail,
  DetalleEnvio: ShipmentDetail,
  DonationSupply,
};
