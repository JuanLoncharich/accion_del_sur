const { Donation, Distribution, Item, Category, sequelize } = require('../models');

exports.summary = async (req, res, next) => {
  try {
    const [
      totalDonations,
      totalDistributions,
      activeCategories,
      totalItemsResult,
      recentDonations,
      recentDistributions,
      stockByCategory,
      weeklyDonations,
    ] = await Promise.all([
      Donation.count(),
      Distribution.count(),
      Category.count({ where: { is_active: true } }),
      sequelize.query(
        'SELECT COALESCE(SUM(quantity), 0) as total FROM items WHERE is_active = 1',
        { type: sequelize.constructor.QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT d.id, d.quantity, d.created_at,
                i.name as item_name, c.name as category_name,
                u.username as registered_by
         FROM donations d
         JOIN items i ON d.item_id = i.id
         JOIN categories c ON i.category_id = c.id
         JOIN users u ON d.registered_by = u.id
         ORDER BY d.created_at DESC LIMIT 10`,
        { type: sequelize.constructor.QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT d.id, d.quantity, d.receiver_identifier, d.created_at,
                i.name as item_name, c.name as category_name
         FROM distributions d
         JOIN items i ON d.item_id = i.id
         JOIN categories c ON i.category_id = c.id
         ORDER BY d.created_at DESC LIMIT 10`,
        { type: sequelize.constructor.QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT c.name as category, SUM(i.quantity) as total
         FROM items i
         JOIN categories c ON i.category_id = c.id
         WHERE i.is_active = 1 AND c.is_active = 1
         GROUP BY c.id, c.name
         ORDER BY total DESC`,
        { type: sequelize.constructor.QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT
           YEARWEEK(created_at, 1) as week_key,
           MIN(DATE(created_at)) as week_start,
           COUNT(*) as count,
           SUM(quantity) as total_quantity
         FROM donations
         WHERE created_at >= DATE_SUB(NOW(), INTERVAL 8 WEEK)
         GROUP BY YEARWEEK(created_at, 1)
         ORDER BY week_key ASC`,
        { type: sequelize.constructor.QueryTypes.SELECT }
      ),
    ]);

    res.json({
      summary: {
        totalDonations,
        totalDistributions,
        activeCategories,
        totalItemsInStock: parseInt(totalItemsResult[0]?.total || 0),
      },
      stockByCategory,
      weeklyDonations,
      recentDonations,
      recentDistributions,
    });
  } catch (error) {
    next(error);
  }
};
