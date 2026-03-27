#!/usr/bin/env node

/**
 * deploy-sft.js — Compila, sube y despliega el contrato SFT en Stellar Testnet
 *
 * Uso:
 *   node src/services/blockchain/scripts/deploy-sft.js
 *
 * Requisitos:
 *   - STELLAR_ENABLED=true en .env
 *   - STELLAR_SECRET_KEY configurada en .env
 *   - El WASM del contrato SFT compilado en:
 *     src/services/blockchain/contrato_sft/target/wasm32-unknown-unknown/release/contrato_sft.wasm
 *     (o pasar la ruta como argumento)
 *
 * Para compilar el contrato (requiere soroban-cli / stellar CLI):
 *   cd src/services/blockchain/contrato_sft
 *   cargo build --target wasm32-unknown-unknown --release
 *   stellar contract optimize --wasm target/wasm32-unknown-unknown/release/contrato_sft.wasm
 *
 * Salida:
 *   Imprime SOROBAN_CONTRACT_SFT y SFT_WASM_HASH para agregar al .env
 */

require('dotenv').config();

const StellarSdk = require('@stellar/stellar-sdk');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ─── Configuración ────────────────────────────────────────────────────────────

const NETWORKS = {
  testnet: {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
  },
  mainnet: {
    rpcUrl: 'https://soroban.stellar.org',
    passphrase: 'Public Global Stellar Network ; September 2015',
  },
};

const networkName = process.env.STELLAR_NETWORK || 'testnet';
const net = NETWORKS[networkName];

if (!net) {
  console.error(`❌ Red desconocida: ${networkName}`);
  process.exit(1);
}

if (!process.env.STELLAR_SECRET_KEY) {
  console.error('❌ STELLAR_SECRET_KEY no configurada en .env');
  process.exit(1);
}

const keypair = StellarSdk.Keypair.fromSecret(process.env.STELLAR_SECRET_KEY);
const rpc = new StellarSdk.rpc.Server(net.rpcUrl);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function pollTransaction(txId) {
  const MAX = 30;
  for (let i = 0; i < MAX; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const result = await rpc.getTransaction(txId);
    if (result.status === StellarSdk.rpc.Api.GetTransactionStatus.SUCCESS) return result;
    if (result.status === StellarSdk.rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`Transacción fallida: ${txId}`);
    }
  }
  throw new Error(`Timeout esperando transacción: ${txId}`);
}

// ─── Paso 1: Subir WASM ──────────────────────────────────────────────────────

async function uploadWasm(wasmPath) {
  const wasm = fs.readFileSync(wasmPath);
  const wasmHash = crypto.createHash('sha256').update(wasm).digest('hex');
  console.log(`📦 WASM: ${wasm.length} bytes, hash: ${wasmHash}`);

  const account = await rpc.getAccount(keypair.publicKey());

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: '10000000',
    networkPassphrase: net.passphrase,
  })
    .setTimeout(60)
    .addOperation(StellarSdk.Operation.uploadContractWasm({ wasm }))
    .build();

  const sim = await rpc.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulación upload falló: ${sim.error}`);
  }

  const prepared = await rpc.prepareTransaction(tx);
  prepared.sign(keypair);

  const response = await rpc.sendTransaction(prepared);
  if (response.status === 'ERROR') {
    throw new Error(`Upload rechazado: ${JSON.stringify(response.errorResult)}`);
  }

  console.log(`⏳ Esperando confirmación del upload... (tx: ${response.hash})`);
  await pollTransaction(response.hash);
  console.log(`✅ WASM subido. Hash: ${wasmHash}`);

  return { wasmHash, wasmHashBuffer: Buffer.from(wasmHash, 'hex') };
}

// ─── Paso 2: Desplegar instancia ─────────────────────────────────────────────

async function deployContract(wasmHashBuffer) {
  const salt = crypto.randomBytes(32);
  const account = await rpc.getAccount(keypair.publicKey());

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: '10000000',
    networkPassphrase: net.passphrase,
  })
    .setTimeout(60)
    .addOperation(StellarSdk.Operation.createCustomContract({
      address: new StellarSdk.Address(keypair.publicKey()),
      wasmHash: wasmHashBuffer,
      salt,
    }))
    .build();

  const sim = await rpc.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulación deploy falló: ${sim.error}`);
  }

  const prepared = await rpc.prepareTransaction(tx);
  prepared.sign(keypair);

  const response = await rpc.sendTransaction(prepared);
  if (response.status === 'ERROR') {
    throw new Error(`Deploy rechazado: ${JSON.stringify(response.errorResult)}`);
  }

  console.log(`⏳ Esperando confirmación del deploy... (tx: ${response.hash})`);
  const result = await pollTransaction(response.hash);

  // Extraer contract ID
  let contractId = null;
  if (result.returnValue) {
    try {
      const native = StellarSdk.scValToNative(result.returnValue);
      if (typeof native === 'string') {
        contractId = native;
      } else if (Buffer.isBuffer(native)) {
        contractId = StellarSdk.StrKey.encodeContract(native);
      }
    } catch {}
  }

  // Fallback: calcular contract ID desde preimage
  if (!contractId) {
    try {
      const preimage = StellarSdk.xdr.HashIdPreimage.envelopeTypeContractId(
        new StellarSdk.xdr.HashIdPreimageContractId({
          networkId: Buffer.from(
            crypto.createHash('sha256').update(net.passphrase).digest()
          ),
          contractIdPreimage: StellarSdk.xdr.ContractIdPreimage.contractIdPreimageFromAddress(
            new StellarSdk.xdr.ContractIdPreimageFromAddress({
              address: new StellarSdk.Address(keypair.publicKey()).toScAddress(),
              salt,
            })
          ),
        })
      );
      const hash = crypto.createHash('sha256').update(preimage.toXDR()).digest();
      contractId = StellarSdk.StrKey.encodeContract(hash);
    } catch (e) {
      throw new Error(`No se pudo determinar el contract ID: ${e.message}`);
    }
  }

  console.log(`✅ Contrato desplegado: ${contractId}`);
  return contractId;
}

// ─── Paso 3: Inicializar el contrato ─────────────────────────────────────────

async function initializeContract(contractId) {
  const account = await rpc.getAccount(keypair.publicKey());
  const contract = new StellarSdk.Contract(contractId);

  const adminAddress = new StellarSdk.Address(keypair.publicKey()).toScVal();

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: '10000000',
    networkPassphrase: net.passphrase,
  })
    .addOperation(contract.call('initialize', adminAddress))
    .setTimeout(30)
    .build();

  const sim = await rpc.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulación initialize falló: ${sim.error}`);
  }

  const prepared = await rpc.prepareTransaction(tx);
  prepared.sign(keypair);

  const response = await rpc.sendTransaction(prepared);
  if (response.status === 'ERROR') {
    throw new Error(`Initialize rechazado: ${JSON.stringify(response.errorResult)}`);
  }

  console.log(`⏳ Esperando confirmación de initialize... (tx: ${response.hash})`);
  await pollTransaction(response.hash);
  console.log(`✅ Contrato inicializado con admin: ${keypair.publicKey()}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Deploy del Contrato SFT — Acción del Sur');
  console.log(`  Red: ${networkName}`);
  console.log(`  Admin: ${keypair.publicKey()}`);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  // Buscar el WASM compilado
  const wasmArg = process.argv[2];
  const defaultWasmPath = path.resolve(
    __dirname,
    '../contrato_sft/target/wasm32-unknown-unknown/release/contrato_sft.wasm'
  );
  const optimizedWasmPath = defaultWasmPath.replace('.wasm', '.optimized.wasm');

  let wasmPath;
  if (wasmArg && fs.existsSync(wasmArg)) {
    wasmPath = wasmArg;
  } else if (fs.existsSync(optimizedWasmPath)) {
    wasmPath = optimizedWasmPath;
  } else if (fs.existsSync(defaultWasmPath)) {
    wasmPath = defaultWasmPath;
  } else {
    console.error('❌ No se encontró el WASM compilado del contrato SFT.');
    console.error('');
    console.error('   Compilar con:');
    console.error('     cd backend/src/services/blockchain/contrato_sft');
    console.error('     cargo build --target wasm32-unknown-unknown --release');
    console.error('');
    console.error(`   O pasar la ruta como argumento:`);
    console.error('     node deploy-sft.js /path/to/contrato_sft.wasm');
    process.exit(1);
  }

  console.log(`📄 Usando WASM: ${wasmPath}`);
  console.log('');

  // Paso 1
  console.log('── Paso 1/3: Subir WASM ──');
  const { wasmHash, wasmHashBuffer } = await uploadWasm(wasmPath);
  console.log('');

  // Paso 2
  console.log('── Paso 2/3: Desplegar instancia ──');
  const contractId = await deployContract(wasmHashBuffer);
  console.log('');

  // Paso 3
  console.log('── Paso 3/3: Inicializar contrato ──');
  await initializeContract(contractId);
  console.log('');

  // Resultado
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  ✅ Deploy completado. Agregar al .env:');
  console.log('');
  console.log(`  SOROBAN_CONTRACT_SFT=${contractId}`);
  console.log(`  SFT_WASM_HASH=${wasmHash}`);
  console.log('═══════════════════════════════════════════════════════════');
}

main().catch((err) => {
  console.error('');
  console.error(`❌ Error: ${err.message}`);
  process.exit(1);
});
