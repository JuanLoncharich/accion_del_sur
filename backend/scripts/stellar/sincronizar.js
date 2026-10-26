/**
 * Reconcilia la blockchain con la base de datos. Es idempotente: se puede correr las veces que
 * haga falta.
 *
 *   1. Despliega el contrato de identidad de cada centro que todavía no tiene uno.
 *   2. Para cada insumo, deja el saldo SFT de su centro igual a su stock en la base, y en cero
 *      en los demás centros (mint o burn de la diferencia).
 *
 *   npm run stellar:sincronizar                 # aplica los cambios
 *   npm run stellar:sincronizar -- --verificar  # solo informa diferencias, no escribe nada
 *   npm run stellar:sincronizar -- --reiniciar  # redespliega TODOS los centros (tras cambiar de SFT)
 *
 * Se usa después de npm run stellar:desplegar (carga inicial del stock existente) y para
 * reparar operaciones que quedaron con estado 'local' porque la red no respondió.
 */
const env = require('./envFile');

env.cargar();
const { sequelize, Center, Item, Category } = require('../../src/models');
const sftService = require('../../src/services/blockchain/sftService');
const anclaje = require('../../src/services/blockchain/anclaje');

const verificar = process.argv.includes('--verificar');
const reiniciar = process.argv.includes('--reiniciar');

async function main() {
  if (!sftService.isEnabled) {
    throw new Error('La blockchain está apagada: revisar STELLAR_ENABLED y SOROBAN_CONTRACT_SFT en backend/.env');
  }
  await sequelize.authenticate();

  // 1. Contratos de centros
  const centros = await Center.findAll({ order: [['id', 'ASC']] });
  console.log(`Centros (${centros.length})`);
  for (const centro of centros) {
    if (reiniciar && !verificar) await centro.update({ blockchain_contract_id: null, blockchain_deploy_tx: null });
    if (centro.blockchain_contract_id) {
      console.log(`  #${centro.id} ${centro.name.padEnd(36)} ${centro.blockchain_contract_id}`);
    } else if (verificar) {
      console.log(`  #${centro.id} ${centro.name.padEnd(36)} SIN CONTRATO`);
    } else {
      const r = await anclaje.desplegarCentro(centro);
      console.log(`  #${centro.id} ${centro.name.padEnd(36)} ${r.status === 'anchored' ? centro.blockchain_contract_id : `ERROR: ${r.error}`}`);
    }
  }

  // 2. Saldos
  const items = await Item.findAll({ include: [{ model: Category, as: 'category' }], order: [['id', 'ASC']] });
  const porToken = new Map(items.map((i) => [sftService.computeTokenId(i.id), i]));
  const conContrato = centros.filter((c) => c.blockchain_contract_id);

  // Pares (centro, insumo) a revisar: los que deberían tener saldo y los que tienen saldo on-chain.
  const pares = new Map();
  const agregar = (centro, item) => pares.set(`${centro.id}:${item.id}`, { centro, item });
  for (const item of items) {
    const centro = conContrato.find((c) => c.id === item.current_center_id);
    if (centro && item.available_quantity > 0) agregar(centro, item);
  }
  for (const centro of conContrato) {
    for (const tokenId of await sftService.getCenterInventory(centro.blockchain_contract_id)) {
      if (porToken.has(tokenId)) agregar(centro, porToken.get(tokenId));
    }
  }

  console.log(`\nSaldos (${pares.size} combinaciones centro/insumo)`);
  let diferencias = 0;
  let errores = 0;
  for (const { centro, item } of pares.values()) {
    const esperado = item.current_center_id === centro.id ? item.available_quantity : 0;
    const actual = await sftService.getBalance(centro.blockchain_contract_id, item.id);
    if (actual === esperado) continue;
    diferencias += 1;
    const delta = esperado - actual;
    const etiqueta = `  ${centro.name} · #${item.id} ${item.name}: on-chain ${actual} → ${esperado}`;
    if (verificar) { console.log(etiqueta); continue; }
    const r = delta > 0
      ? await anclaje.mintearIngreso({ item, center: centro, cantidad: delta })
      : await anclaje.quemarSalida({ item, center: centro, cantidad: -delta, referencia: `sincronizacion:${new Date().toISOString()}` });
    if (r.status !== 'anchored') errores += 1;
    console.log(`${etiqueta}  ${r.status === 'anchored' ? `OK (${delta > 0 ? 'mint' : 'burn'} ${Math.abs(delta)})` : `ERROR: ${r.error}`}`);
  }

  console.log(diferencias === 0
    ? '\nTodo sincronizado: la blockchain coincide con la base.'
    : `\n${diferencias} diferencia(s)${verificar ? ' encontradas (modo --verificar, no se aplicó nada).' : `, ${errores} con error.`}`);
  if (errores) process.exitCode = 1;
}

main()
  .catch((e) => { console.error(`\nError: ${e.message}`); process.exitCode = 1; })
  .finally(() => sequelize.close());
