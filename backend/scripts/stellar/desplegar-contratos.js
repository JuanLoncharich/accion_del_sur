/**
 * Sube los WASM de contracts/ y despliega los contratos de la aplicación con la cuenta de
 * STELLAR_SECRET_KEY, que queda como administradora. Escribe los IDs en backend/.env.
 *
 *   1. Compilar:   cd contracts && stellar contract build
 *   2. Desplegar:  cd backend && npm run stellar:desplegar
 *   3. Centros y stock inicial:  npm run stellar:sincronizar
 *
 * Despliega una instancia de contrato_sft y una de contrato_entregas, y sube el WASM de
 * contrato_centro (sus instancias se crean una por centro, al dar de alta cada centro).
 * Volver a correrlo crea contratos NUEVOS (con saldos en cero) y reemplaza los IDs del .env.
 */
const fs = require('fs');
const path = require('path');
const env = require('./envFile');

env.cargar();
process.env.STELLAR_ENABLED = 'true'; // el servicio solo se inicializa si está habilitado
const StellarSdk = require('@stellar/stellar-sdk');
const stellarService = require('../../src/services/blockchain/stellarService');

const CONTRACTS_DIR = path.resolve(__dirname, '../../../contracts');

function wasmPath(nombre) {
  const candidatos = ['wasm32v1-none', 'wasm32-unknown-unknown']
    .map((target) => path.join(CONTRACTS_DIR, 'target', target, 'release', `${nombre}.wasm`));
  const encontrado = candidatos.find((p) => fs.existsSync(p));
  if (!encontrado) {
    throw new Error(`No se encontró ${nombre}.wasm. Compilar primero con: cd contracts && stellar contract build`);
  }
  return encontrado;
}

async function subir(nombre) {
  const { wasmHash } = await stellarService.uploadWasm(fs.readFileSync(wasmPath(nombre)));
  console.log(`  ${nombre.padEnd(18)} WASM ${wasmHash}`);
  return wasmHash;
}

async function desplegarConAdmin(nombre, wasmHash) {
  const { contractId } = await stellarService.deployContract(wasmHash);
  const admin = new StellarSdk.Address(stellarService.keypair.publicKey()).toScVal();
  await stellarService._invocarContrato(contractId, 'initialize', [admin]);
  console.log(`  ${nombre.padEnd(18)} ${contractId}`);
  return contractId;
}

async function main() {
  if (!process.env.STELLAR_SECRET_KEY) throw new Error('Falta STELLAR_SECRET_KEY (correr npm run stellar:cuenta).');
  console.log(`Red: ${stellarService.networkName} · Admin: ${stellarService.keypair.publicKey()}\n`);

  console.log('Subiendo WASM...');
  const sftHash = await subir('contrato_sft');
  const entregasHash = await subir('contrato_entregas');
  const centroHash = await subir('contrato_centro');

  console.log('\nDesplegando e inicializando...');
  const sft = await desplegarConAdmin('contrato_sft', sftHash);
  const entregas = await desplegarConAdmin('contrato_entregas', entregasHash);

  env.actualizar({
    STELLAR_ENABLED: 'true',
    SOROBAN_CONTRACT_SFT: sft,
    SOROBAN_CONTRACT_ENTREGAS: entregas,
    CENTRO_WASM_HASH: centroHash,
  });

  const base = `https://stellar.expert/explorer/${stellarService.networkName}/contract`;
  console.log(`\nListo. IDs guardados en ${env.ENV_PATH}.`);
  console.log(`  ${base}/${sft}`);
  console.log(`  ${base}/${entregas}`);
  console.log('\nSiguiente paso: npm run stellar:sincronizar (contratos de centros + stock inicial) y reiniciar el backend.');
}

main().catch((e) => { console.error(`\nError: ${e.message}`); process.exit(1); });
