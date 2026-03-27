const fs = require('fs');
const crypto = require('crypto');
const sequelize = require('../../src/config/database');

async function main() {
  const allow = JSON.parse(fs.readFileSync('llm_non_sensitive_allowlist.json', 'utf8'));

  const db = allow.database || process.env.DB_NAME || 'accion_del_sur';
  const user = process.env.LLM_DB_USER || 'llm_reader';
  const host = process.env.LLM_DB_HOST || 'localhost';
  const password = process.env.LLM_DB_PASSWORD || crypto.randomBytes(18).toString('base64url');

  const esc = (s) => String(s).replace(/'/g, "''");
  const userQualifier = `'${esc(user)}'@'${esc(host)}'`;

  await sequelize.authenticate();

  const entries = Object.entries(allow.tables || {}).filter(([, meta]) =>
    Array.isArray(meta.allowedColumns) && meta.allowedColumns.length > 0
  );

  for (const [table, meta] of entries) {
    const viewName = `llm_${table}`;
    const cols = meta.allowedColumns.map((c) => `\`${c}\``).join(', ');
    await sequelize.query(`CREATE OR REPLACE VIEW \`${viewName}\` AS SELECT ${cols} FROM \`${table}\``);
  }

  await sequelize.query(`CREATE USER IF NOT EXISTS ${userQualifier} IDENTIFIED BY '${esc(password)}'`);
  await sequelize.query(`ALTER USER ${userQualifier} IDENTIFIED BY '${esc(password)}'`);
  await sequelize.query(`REVOKE ALL PRIVILEGES, GRANT OPTION FROM ${userQualifier}`);
  await sequelize.query(`GRANT USAGE ON *.* TO ${userQualifier}`);

  for (const [table] of entries) {
    const viewName = `llm_${table}`;
    await sequelize.query(`GRANT SELECT ON \`${db}\`.\`${viewName}\` TO ${userQualifier}`);
  }

  await sequelize.query('FLUSH PRIVILEGES');

  const [grants] = await sequelize.query(`SHOW GRANTS FOR ${userQualifier}`);
  const [views] = await sequelize.query(
    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'llm_%' ORDER BY TABLE_NAME"
  );

  console.log(`DB=${db}`);
  console.log(`USER=${user}`);
  console.log(`HOST=${host}`);
  console.log(`PASSWORD=${password}`);
  console.log(`VIEWS=${views.map((v) => v.TABLE_NAME).join(',')}`);
  console.log('GRANTS_START');
  for (const grant of grants) {
    const key = Object.keys(grant)[0];
    console.log(grant[key]);
  }
  console.log('GRANTS_END');
}

main()
  .catch((error) => {
    console.error('DB_ERROR:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await sequelize.close();
    } catch {
      // ignore
    }
  });
