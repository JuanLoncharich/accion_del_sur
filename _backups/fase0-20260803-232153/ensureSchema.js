const { sequelize } = require('../models');

// New installations are created by Sequelize from the domain models. Existing
// installations must use the explicit destructive reset command because the old
// schema is intentionally incompatible and its data must not be migrated.
const ensureSchema = async () => sequelize.sync({ alter: false });

module.exports = { ensureSchema };
