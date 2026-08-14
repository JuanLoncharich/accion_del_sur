const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

/**
 * ensureSchema.js
 *
 * - sequelize.sync({ alter: false }) crea las tablas NUEVAS (transfers, recepciones,
 *   recepciones_detalles) con CREATE TABLE IF NOT EXISTS, pero NO modifica tablas existentes.
 * - Para añadir columnas a tablas existentes (insumos, centros_recepcion, donaciones,
 *   donaciones_insumos) usamos ALTER TABLE idempotente: se comprueba information_schema
 *   antes, y se ignora el error "Duplicate column" por si dos instancias backend corren a la vez.
 * - Los backfills dejan datos históricos coherentes (is_active=1, current_center_id por defecto).
 */

const hasColumn = async (tableName, columnName) => {
  const rows = await sequelize.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    { replacements: [tableName, columnName], type: QueryTypes.SELECT }
  );
  return Array.isArray(rows) && rows.length > 0;
};

const addColumnIfMissing = async (tableName, columnName, columnDef) => {
  if (await hasColumn(tableName, columnName)) return false;
  try {
    await sequelize.query(`ALTER TABLE \`${tableName}\` ADD COLUMN ${columnDef}`);
    console.log(`[DB] Columna añadida: ${tableName}.${columnName}`);
    return true;
  } catch (error) {
    if (/Duplicate column/i.test(error.message || '')) return false;
    throw error;
  }
};

const runMigrations = async () => {
  // insumos
  await addColumnIfMissing('insumos', 'current_center_id', '`current_center_id` INT NULL');
  await addColumnIfMissing('insumos', 'is_active', '`is_active` TINYINT(1) NOT NULL DEFAULT 1');
  await addColumnIfMissing('insumos', 'token_id', '`token_id` VARCHAR(64) NULL');
  await addColumnIfMissing('insumos', 'attributes_hash', '`attributes_hash` VARCHAR(64) NULL');

  // centros_recepcion
  await addColumnIfMissing('centros_recepcion', 'is_active', '`is_active` TINYINT(1) NOT NULL DEFAULT 1');
  await addColumnIfMissing('centros_recepcion', 'blockchain_contract_id', '`blockchain_contract_id` VARCHAR(120) NULL');

  // donaciones_insumos
  await addColumnIfMissing('donaciones_insumos', 'quantity', '`quantity` INT NOT NULL DEFAULT 1');

  // donaciones
  await addColumnIfMissing('donaciones', 'status', "`status` VARCHAR(40) NOT NULL DEFAULT 'confirmada'");

  // Backfills (solo actualizan NULLs / incoherencias; nunca sobrescriben datos válidos).
  await sequelize.query('UPDATE insumos SET is_active = 1 WHERE is_active IS NULL');
  await sequelize.query('UPDATE centros_recepcion SET is_active = 1 WHERE is_active IS NULL');
  await sequelize.query(
    'UPDATE donaciones_insumos SET quantity = 1 WHERE quantity IS NULL OR quantity < 1'
  );
  // Ítems sin centro asignado → se asignan al primer centro para que sean transferibles.
  await sequelize.query(
    'UPDATE insumos SET current_center_id = (SELECT MIN(id) FROM centros_recepcion) WHERE current_center_id IS NULL'
  );
};

const ensureSchema = async () => {
  await sequelize.sync({ alter: false });
  await runMigrations();
};

module.exports = { ensureSchema, addColumnIfMissing, hasColumn };
