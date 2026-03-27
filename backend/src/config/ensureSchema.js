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

const ensureDonationReceptionTables = async () => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS donation_receptions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      public_token_qr VARCHAR(128) NOT NULL UNIQUE,
      donor_email VARCHAR(255) NOT NULL,
      donor_email_salt VARCHAR(64) NOT NULL,
      donor_email_hash VARCHAR(64) NOT NULL,
      status ENUM('processing', 'completed', 'partially_rejected', 'rejected', 'failed_anchor') NOT NULL DEFAULT 'processing',
      rejection_reason TEXT NULL,
      anchored_tx_id VARCHAR(255) NULL,
      anchored_hash VARCHAR(64) NULL,
      created_by INT NOT NULL,
      finalized_by INT NULL,
      finalized_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_reception_status (status),
      INDEX idx_reception_public_token (public_token_qr),
      INDEX idx_reception_created_by (created_by),
      CONSTRAINT fk_reception_created_by FOREIGN KEY (created_by) REFERENCES users(id),
      CONSTRAINT fk_reception_finalized_by FOREIGN KEY (finalized_by) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS donation_reception_details (
      id INT AUTO_INCREMENT PRIMARY KEY,
      reception_id INT NOT NULL,
      item_id INT NOT NULL,
      quantity_received INT NOT NULL,
      quantity_accepted INT NOT NULL,
      quantity_rejected INT NOT NULL DEFAULT 0,
      rejection_reason_item TEXT NULL,
      INDEX idx_detail_reception (reception_id),
      INDEX idx_detail_item (item_id),
      CONSTRAINT fk_detail_reception FOREIGN KEY (reception_id) REFERENCES donation_receptions(id),
      CONSTRAINT fk_detail_item FOREIGN KEY (item_id) REFERENCES items(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
};

const ensureColumnNullable = async (table, column) => {
  const [rows] = await sequelize.query(
    `SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column`,
    { replacements: { table, column } }
  );
  if (rows.length > 0 && rows[0].IS_NULLABLE === 'NO') {
    const [colDef] = await sequelize.query(`SHOW COLUMNS FROM ${table} LIKE :column`, { replacements: { column } });
    if (colDef.length > 0) {
      const type = colDef[0].Type;
      await sequelize.query(`ALTER TABLE ${table} MODIFY COLUMN ${column} ${type} NULL`);
      console.log(`[DB] Columna hecha nullable: ${table}.${column}`);
    }
  }
};

const ensureSchema = async () => {
  for (const [table, columns] of Object.entries(tableColumnDefinitions)) {
    for (const [column, definition] of Object.entries(columns)) {
      // eslint-disable-next-line no-await-in-loop
      await ensureColumn(table, column, definition);
    }
  }

  await ensureColumnNullable('distributions', 'receiver_identifier');
  await ensureAuditAccessLogTable();
  await ensureDonationReceptionTables();
};

module.exports = { ensureSchema };
