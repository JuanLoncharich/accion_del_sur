const { sequelize } = require('../models');

const tableColumnDefinitions = {
  distributions: {
    status: "ENUM('draft','identified','signed','pending_anchor','anchored','failed') NOT NULL DEFAULT 'draft'",
    nonce: 'VARCHAR(120) NULL',
    expires_at: 'DATETIME NULL',
    identity_capture_method: "ENUM('manual') NULL",
    assurance_level: "ENUM('MANUAL_VERIFIED') NULL",
    recipient_commitment: 'VARCHAR(64) NULL',
    recipient_salt: 'VARCHAR(128) NULL',
    signature_data: 'LONGTEXT NULL',
    signature_mime: 'VARCHAR(100) NULL',
    signature_hash: 'VARCHAR(64) NULL',
    receipt_payload: 'JSON NULL',
    receipt_hash: 'VARCHAR(64) NULL',
    blockchain_tx_id: 'VARCHAR(255) NULL',
    finalized_at: 'DATETIME NULL',
    capture_terminal: 'VARCHAR(120) NULL',
    capture_ip: 'VARCHAR(120) NULL',
    capture_device: 'VARCHAR(255) NULL',
    center_name: 'VARCHAR(120) NULL',
    center_latitude: 'DECIMAL(10,7) NULL',
    center_longitude: 'DECIMAL(10,7) NULL',
  },
  donations: {
    center_name: 'VARCHAR(120) NULL',
    center_latitude: 'DECIMAL(10,7) NULL',
    center_longitude: 'DECIMAL(10,7) NULL',
    center_geo_hash: 'VARCHAR(64) NULL',
    blockchain_hash: 'VARCHAR(255) NULL',
    blockchain_tx_id: 'VARCHAR(255) NULL',
    status: "ENUM('pending','anchored','failed') NOT NULL DEFAULT 'pending'",
  },
};

const ensureColumn = async (table, column, definition) => {
  const [rows] = await sequelize.query(`SHOW COLUMNS FROM ${table} LIKE :column`, {
    replacements: { column },
  });

  if (rows.length === 0) {
    await sequelize.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[DB] Columna agregada: ${table}.${column}`);
  }
};

const ensureAuditAccessLogTable = async () => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS audit_access_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      distribution_id INT NOT NULL,
      access_type ENUM('public','internal') NOT NULL,
      accessed_by INT NULL,
      purpose VARCHAR(255) NULL,
      requester_ip VARCHAR(120) NULL,
      requester_device VARCHAR(255) NULL,
      external_reference VARCHAR(255) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audit_distribution (distribution_id),
      INDEX idx_audit_accessed_by (accessed_by),
      CONSTRAINT fk_audit_distribution FOREIGN KEY (distribution_id) REFERENCES distributions(id),
      CONSTRAINT fk_audit_accessed_by FOREIGN KEY (accessed_by) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

const ensureSchema = async () => {
  for (const [table, columns] of Object.entries(tableColumnDefinitions)) {
    for (const [column, definition] of Object.entries(columns)) {
      // eslint-disable-next-line no-await-in-loop
      await ensureColumn(table, column, definition);
    }
  }

  await ensureAuditAccessLogTable();
};

module.exports = { ensureSchema };
