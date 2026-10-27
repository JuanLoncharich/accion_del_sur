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
const TokenTransfer = require('./TokenTransfer');
const Reception = require('./Reception');
const ReceptionDetail = require('./ReceptionDetail');

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

// Acceso directo línea de donación → insumo (agregados de la landing).
DonationSupply.belongsTo(Item, { foreignKey: 'supply_id', as: 'supply' });
DonationSupply.belongsTo(Donation, { foreignKey: 'donation_id', as: 'donation' });

User.hasMany(Shipment, { foreignKey: 'registered_by', as: 'registeredShipments' });
Shipment.belongsTo(User, { foreignKey: 'registered_by', as: 'registeredBy' });
Center.hasMany(Shipment, { foreignKey: 'reception_center_id', as: 'shipments' });
Shipment.belongsTo(Center, { foreignKey: 'reception_center_id', as: 'destination' });
Shipment.hasMany(ShipmentDetail, { foreignKey: 'shipment_id', as: 'details' });
ShipmentDetail.belongsTo(Shipment, { foreignKey: 'shipment_id', as: 'shipment' });
Item.hasMany(ShipmentDetail, { foreignKey: 'supply_id', as: 'shipmentDetails' });
ShipmentDetail.belongsTo(Item, { foreignKey: 'supply_id', as: 'supply' });

// Ubicación actual del insumo en un centro.
Center.hasMany(Item, { foreignKey: 'current_center_id', as: 'items' });
Item.belongsTo(Center, { foreignKey: 'current_center_id', as: 'currentCenter' });

// Transferencias de tokens entre centros.
Item.hasMany(TokenTransfer, { foreignKey: 'item_id', as: 'transfers' });
TokenTransfer.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
Center.hasMany(TokenTransfer, { foreignKey: 'from_center_id', as: 'outgoingTransfers' });
Center.hasMany(TokenTransfer, { foreignKey: 'to_center_id', as: 'incomingTransfers' });
TokenTransfer.belongsTo(Center, { foreignKey: 'from_center_id', as: 'fromCenter' });
TokenTransfer.belongsTo(Center, { foreignKey: 'to_center_id', as: 'toCenter' });
User.hasMany(TokenTransfer, { foreignKey: 'transferred_by', as: 'registeredTransfers' });
TokenTransfer.belongsTo(User, { foreignKey: 'transferred_by', as: 'transferredBy' });

// Recepciones de donación con QR + anclaje.
Center.hasMany(Reception, { foreignKey: 'reception_center_id', as: 'receptions' });
Reception.belongsTo(Center, { foreignKey: 'reception_center_id', as: 'center' });
User.hasMany(Reception, { foreignKey: 'operator_id', as: 'operatedReceptions' });
Reception.belongsTo(User, { foreignKey: 'operator_id', as: 'operator' });
Reception.hasMany(ReceptionDetail, { foreignKey: 'reception_id', as: 'details' });
ReceptionDetail.belongsTo(Reception, { foreignKey: 'reception_id', as: 'reception' });
Item.hasMany(ReceptionDetail, { foreignKey: 'item_id', as: 'receptionDetails' });
ReceptionDetail.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });

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
  TokenTransfer,
  TransferenciaToken: TokenTransfer,
  Reception,
  Recepcion: Reception,
  ReceptionDetail,
  RecepcionDetalle: ReceptionDetail,
};
