'use strict';

/**
 * Despliega un contrato Soroban de centro por cada centro en la base (testnet),
 * lo inicializa y guarda el contract id real en centers.blockchain_contract_id.
 *
 *   node src/services/blockchain/scripts/deploy-centros.js [--only=<id>]
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../../.env') });

const stellarService = require('../stellarService');
const { sequelize, Center } = require('../../../models');

const e6 = (v) => Math.round(Number(v || 0) * 1e6);

const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const onlyId = onlyArg ? Number(onlyArg.split('=')[1]) : null;

const run = async () => {
  if (process.env.STELLAR_ENABLED !== 'true') {
    throw new Error('STELLAR_ENABLED debe estar en true en .env');
  }
  await sequelize.authenticate();

  const where = onlyId ? { id: onlyId } : {};
  const centros = await Center.findAll({ where, order: [['id', 'ASC']] });
  if (!centros.length) throw new Error('No hay centros para desplegar.');

  console.log(`\n=== Desplegando ${centros.length} contrato(s) de centro en testnet ===\n`);

  for (const centro of centros) {
    console.log(`▶ Centro #${centro.id} — ${centro.name}`);
    try {
      const { contractId, txId } = await stellarService.deployCenterContract();
      console.log(`   deploy OK → ${contractId}  (tx ${txId.slice(0, 12)}…)`);

      const init = await stellarService.initializeCenter(contractId, {
        nombre: centro.name,
        lat_e6: e6(centro.latitude),
        lng_e6: e6(centro.longitude),
        // geo_hash omitido: initializeCenter calcula un SHA-256 válido (64 hex) a partir de nombre|lat|lng
      });
      console.log(`   inicializar → ${init.success ? 'OK' : 'pendiente'}${init.txId ? ` (tx ${init.txId.slice(0, 12)}…)` : ''}`);

      await centro.update({
        blockchain_contract_id: contractId,
        blockchain_deploy_tx: txId,
        blockchain_init_tx: init.txId || null,
      });
      console.log(`   base actualizada ✓\n`);
    } catch (e) {
      console.error(`   ✗ ERROR en centro #${centro.id}: ${e.message}\n`);
      throw e;
    }
  }

  console.log('=== Resumen ===');
  const actualizados = await Center.findAll({ where, order: [['id', 'ASC']] });
  actualizados.forEach((c) => console.log(`  #${c.id} ${c.name.padEnd(38)} ${c.blockchain_contract_id}`));
};

run()
  .then(async () => { await sequelize.close(); process.exit(0); })
  .catch(async (e) => { console.error('\n[Deploy] Falló:', e.message); await sequelize.close().catch(() => {}); process.exit(1); });
