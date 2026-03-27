const { Donation, Distribution, Center, sequelize } = require('../models');

const COLOR_PALETTE = ['#E34E26', '#2E4053', '#1B2631', '#B9A48E', '#D5DBDB', '#7B8A8B'];

const formatInt = (value) => Number.parseInt(value || 0, 10);

const buildTickerFacts = ({ totalDonations, activeCenters, beneficiariesReached, deliveredVolume }) => {
  return [
    `${totalDonations} donaciones registradas`,
    `${activeCenters} centros activos`,
    `${beneficiariesReached} beneficiarios alcanzados`,
    `${deliveredVolume} unidades entregadas`,
    'Transparencia total garantizada',
  ];
};

exports.summary = async (req, res, next) => {
  try {
    const [
      totalDonations,
      activeCenters,
      deliveredVolumeRaw,
      beneficiariesRaw,
      categoryRows,
    ] = await Promise.all([
      Donation.count(),
      Center.count({ where: { is_active: true } }),
      Distribution.sum('quantity'),
      sequelize.query(
        `SELECT COUNT(DISTINCT receiver_identifier) as total
         FROM distributions
         WHERE receiver_identifier IS NOT NULL
           AND TRIM(receiver_identifier) <> ''`,
        { type: sequelize.constructor.QueryTypes.SELECT }
      ),
      sequelize.query(
        `SELECT c.name as category, SUM(d.quantity) as total
         FROM donations d
         JOIN items i ON d.item_id = i.id
         JOIN categories c ON i.category_id = c.id
         GROUP BY c.id, c.name
         HAVING SUM(d.quantity) > 0
         ORDER BY total DESC`,
        { type: sequelize.constructor.QueryTypes.SELECT }
      ),
    ]);

    const deliveredVolume = formatInt(deliveredVolumeRaw || 0);
    const beneficiariesReached = formatInt(beneficiariesRaw[0]?.total || 0);

    const categoryTotal = categoryRows.reduce((acc, row) => acc + formatInt(row.total), 0);
    const categoryBreakdown = categoryRows.map((row, idx) => {
      const quantity = formatInt(row.total);
      const percentage = categoryTotal > 0 ? Math.round((quantity / categoryTotal) * 100) : 0;
      return {
        name: row.category,
        value: percentage,
        quantity,
        color: COLOR_PALETTE[idx % COLOR_PALETTE.length],
      };
    });

    res.json({
      summary: {
        totalDonations,
        activeCenters,
        beneficiariesReached,
        deliveredVolume,
      },
      categoryBreakdown,
      tickerFacts: buildTickerFacts({
        totalDonations,
        activeCenters,
        beneficiariesReached,
        deliveredVolume,
      }),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

exports.centersRanking = async (req, res, next) => {
  try {
    const rows = await sequelize.query(
      `SELECT
         c.id,
         c.name,
         c.latitude,
         c.longitude,
         COALESCE(don_stats.donation_count, 0) as processed,
         COALESCE(don_stats.total_quantity, 0) as total_quantity
       FROM centers c
       LEFT JOIN (
         SELECT center_id, COUNT(*) as donation_count, SUM(quantity) as total_quantity
         FROM donations
         GROUP BY center_id
       ) don_stats ON don_stats.center_id = c.id
       WHERE c.is_active = 1
       ORDER BY processed DESC, total_quantity DESC, c.name ASC
       LIMIT 8`,
      { type: sequelize.constructor.QueryTypes.SELECT }
    );

    const centers = rows.map((row) => ({
      id: row.id,
      name: row.name,
      latitude: row.latitude,
      longitude: row.longitude,
      processed: formatInt(row.processed),
      locationLabel: row.latitude != null && row.longitude != null
        ? `Lat ${Number(row.latitude).toFixed(3)}, Lng ${Number(row.longitude).toFixed(3)}`
        : 'Ubicacion no disponible',
    }));

    res.json({
      rankingBasis: 'donations_count',
      data: centers,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

exports.recentMovements = async (req, res, next) => {
  try {
    const rows = await sequelize.query(
      `SELECT
         t.id,
         t.quantity,
         t.status,
         t.created_at,
         i.name as item_name,
         c.name as category_name,
         fc.name as from_center_name,
         tc.name as to_center_name
       FROM token_transfers t
       LEFT JOIN items i ON i.id = t.item_id
       LEFT JOIN categories c ON c.id = i.category_id
       LEFT JOIN centers fc ON fc.id = t.from_center_id
       LEFT JOIN centers tc ON tc.id = t.to_center_id
       ORDER BY t.created_at DESC
       LIMIT 8`,
      { type: sequelize.constructor.QueryTypes.SELECT }
    );

    const statusToLanding = {
      anchored: { label: 'Entregada', progress: 100 },
      pending: { label: 'En verificacion', progress: 45 },
      failed: { label: 'En verificacion', progress: 20 },
    };

    const data = rows.map((row) => {
      const mapping = statusToLanding[row.status] || statusToLanding.pending;
      return {
        id: `T-${row.id}`,
        type: row.category_name || row.item_name || 'Movimiento',
        quantity: `${formatInt(row.quantity)} unidades`,
        route: `${row.from_center_name || 'Origen'} -> ${row.to_center_name || 'Destino'}`,
        status: mapping.label,
        progress: mapping.progress,
        createdAt: row.created_at,
      };
    });

    res.json({ data, generatedAt: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
};
