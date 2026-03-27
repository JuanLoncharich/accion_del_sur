#!/usr/bin/env node
const { Sequelize } = require('sequelize');

const sql = process.argv.slice(2).join(' ').trim();
if (!sql) {
  console.error('Uso: mysql_readonly_query_node.js "<SQL>"');
  process.exit(1);
}

const dbHost = process.env.LLM_DB_HOST || process.env.DB_HOST || 'localhost';
const dbPort = parseInt(process.env.LLM_DB_PORT || process.env.DB_PORT || '3306', 10);
const dbUser = process.env.LLM_DB_USER || process.env.DB_USER || 'llm_reader';
const dbPassword = process.env.LLM_DB_PASSWORD || process.env.DB_PASSWORD || '';
const dbName = process.env.LLM_DB_NAME || process.env.DB_NAME || 'accion_del_sur';

const sequelize = new Sequelize(dbName, dbUser, dbPassword, {
  host: dbHost,
  port: dbPort,
  dialect: 'mysql',
  logging: false,
});

(async () => {
  try {
    const [rows, meta] = await sequelize.query(sql, { raw: true });

    if (!Array.isArray(rows)) {
      console.log('OK');
      return;
    }

    if (rows.length === 0) {
      console.log('(sin filas)');
      return;
    }

    const columns = Object.keys(rows[0]);
    const widths = columns.map((c) => c.length);

    for (const row of rows) {
      columns.forEach((c, i) => {
        const v = row[c] === null || row[c] === undefined ? 'NULL' : String(row[c]);
        widths[i] = Math.max(widths[i], v.length);
      });
    }

    const line = '+' + widths.map((w) => '-'.repeat(w + 2)).join('+') + '+';
    const fmt = (vals) =>
      '| ' +
      vals
        .map((v, i) => {
          const s = v === null || v === undefined ? 'NULL' : String(v);
          return s.padEnd(widths[i], ' ');
        })
        .join(' | ') +
      ' |';

    console.log(line);
    console.log(fmt(columns));
    console.log(line);
    for (const row of rows) {
      console.log(fmt(columns.map((c) => row[c])));
    }
    console.log(line);
  } catch (error) {
    console.error(`Error SQL: ${error.message}`);
    process.exitCode = 2;
  } finally {
    await sequelize.close();
  }
})();
