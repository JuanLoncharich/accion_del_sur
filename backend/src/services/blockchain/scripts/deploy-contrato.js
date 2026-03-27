/**
 * deploy-contrato.js
 *
 * Despliega el contrato Soroban usando JavaScript SDK
 * Uso: node backend/src/services/blockchain/scripts/deploy-contrato.js
 */

const path = require('path');

// Cargar .env desde el directorio backend
const envPath = path.join(__dirname, '../../../../.env');
require('dotenv').config({ path: envPath });

const StellarSdk = require('@stellar/stellar-sdk');
const fs = require('fs');

const RPC_URL = 'https://soroban-testnet.stellar.org';
const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

async function main() {
  console.log('🚀 Deploy Contrato Donaciones — Acción del Sur\n');

  if (!process.env.STELLAR_SECRET_KEY) {
    console.error('❌ STELLAR_SECRET_KEY no está configurada en .env');
    process.exit(1);
  }

  const wasmPath = path.join(__dirname, '../contrato_donaciones/target/wasm32-unknown-unknown/release/contrato_donaciones.wasm');

  if (!fs.existsSync(wasmPath)) {
    console.error('❌ No se encontró el WASM. Ejecutá primero:');
    console.error('   cd backend/src/services/blockchain/contrato_donaciones');
    console.error('   cargo build --target wasm32-unknown-unknown --release');
    process.exit(1);
  }

  const wasm = fs.readFileSync(wasmPath);
  console.log(`📦 Contrato WASM: ${wasm.length} bytes\n`);

  const server = new StellarSdk.rpc.Server(RPC_URL, { allowHttp: true });
  const horizon = new StellarSdk.Horizon.Server(HORIZON_URL);

  const keypair = StellarSdk.Keypair.fromSecret(process.env.STELLAR_SECRET_KEY);
  const publicKey = keypair.publicKey();

  console.log(`🔑 Usando cuenta: ${publicKey}\n`);

  // Obtener cuenta
  console.log('📊 Obteniendo información de cuenta...');
  const account = await horizon.loadAccount(publicKey);
  console.log(`   Secuencia: ${account.sequence}\n`);

  // Crear transacción de upload del WASM
  console.log('📝 Creando transacción para subir WASM...');
  const transaction = new StellarSdk.TransactionBuilder(account, {
    fee: '10000',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .setTimeout(30)
    .addOperation(
      StellarSdk.Operation.invokeHostFunction({
        func: StellarSdk.HostFunctionType.uploadContractWasm,
        args: [StellarSdk.xdr.ScVal.scvBytes(wasm)],
      })
    )
    .build();

  // Simular
  console.log('🔮 Simulando transacción...');
  const sim = await server.simulateTransaction(transaction);

  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    console.error('❌ Error en simulación:', sim.error);
    console.error('   Detalles:', JSON.stringify(sim, null, 2));
    process.exit(1);
  }

  console.log('✅ Simulación exitosa');

  // Preparar
  console.log('⚙️  Preparando transacción...');
  const preparedTx = await server.prepareTransaction(transaction);
  console.log('   ✅ Transacción preparada');

  // Firmar
  console.log('✍️  Firmando transacción...');
  preparedTx.sign(keypair);
  console.log('   ✅ Transacción firmada');

  // Enviar
  console.log('📤 Enviando transacción...');
  const sendResponse = await server.sendTransaction(preparedTx);

  if (sendResponse.errorResult) {
    console.error('❌ Error al enviar:', sendResponse.errorResult);
    process.exit(1);
  }

  console.log(`   TX Hash: ${sendResponse.hash}\n`);

  // Esperar confirmación
  console.log('⏳ Esperando confirmación (puede tomar 10-20 segundos)...');
  let txResult = await server.getTransaction(sendResponse.hash);

  let attempts = 0;
  while (txResult.status === StellarSdk.rpc.Api.GetTransactionStatus.NOT_FOUND && attempts < 30) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    txResult = await server.getTransaction(sendResponse.hash);
    attempts++;
    if (attempts % 5 === 0) {
      console.log(`   Esperando... (${attempts}s)`);
    }
  }

  console.log('');

  if (txResult.status === StellarSdk.rpc.Api.GetTransactionStatus.SUCCESS) {
    // Obtener el Wasm ID del resultado
    const wasmId = Buffer.from(txResult.resultRetVal.toXDR().value()).toString('hex');

    console.log('✅ Contrato WASM subido exitosamente!\n');
    console.log(`   Wasm ID (hex): ${wasmId}`);
    console.log('');
    console.log('📝 Para crear una instancia del contrato, necesitá ejecutar:');
    console.log('   stellar contract deploy --wasm <WASM_PATH> --network testnet');
    console.log('');
    console.log('   O usar stellar-cli:');
    console.log(`   stellar contract deploy --wasm ${wasmPath} --network testnet`);
    console.log('');
    console.log('⚠️  NOTA: El contrato actualizado con registrar_entrega_verificada');
    console.log('   ha sido subido. El Contract ID anterior puede no funcionar');
    console.log('   porque no tiene esta función.');
  } else {
    console.error('❌ Error en confirmación:', txResult);
    console.error('   Estado:', txResult.status);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
