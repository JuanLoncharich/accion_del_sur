const { Donation, Item, Center, Shipment } = require('../models');

exports.summary = async (req, res, next) => {
  try {
    const [totalDonations, activeCenters, deliveredVolume, beneficiariesReached] = await Promise.all([
      Donation.count(),
      Center.count(),
      Item.sum('available_quantity').then((value) => Number(value) || 0),
      Center.count({ include: [{ model: Shipment, as: 'shipments', required: true, where: { confirmed: true }, attributes: [] }], distinct: true }),
    ]);
    res.json({
      summary: { totalDonations, activeCenters, beneficiariesReached, deliveredVolume },
      categoryBreakdown: [],
      tickerFacts: [`${totalDonations} donaciones registradas`, `${activeCenters} centros activos`],
      generatedAt: new Date().toISOString(),
    });
  } catch (error) { next(error); }
};

exports.centersRanking = async (req, res, next) => {
  try {
    const centers = await Center.findAll({ attributes: ['id', 'name', 'location'], order: [['name', 'ASC']] });
    res.json({ rankingBasis: 'shipments_count', data: centers, generatedAt: new Date().toISOString() });
  } catch (error) { next(error); }
};

exports.recentMovements = async (req, res, next) => {
  try { res.json({ data: [], generatedAt: new Date().toISOString() }); }
  catch (error) { next(error); }
};
