/**
 * Deploy simple usando SDK JavaScript
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const StellarSdk = require('@stellar/stellar-sdk');
const fs = require('fs');

const RPC_URL = 'https://soroban-testnet.stellar.org';
const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

async function deployContract() {
  console.log('🚀 Deploy Contrato Simplificado\n');

  if (!process.env.STELLAR_SECRET_KEY) {
    console.error('❌ STELLAR_SECRET_KEY no configurada');
    process.exit(1);
  }

  const wasmPath = path.join(__dirname, 'src/services/blockchain/contrato_donaciones/target/wasm32-unknown-unknown/release/contrato_donaciones.wasm');

  if (!fs.existsSync(wasmPath)) {
    console.error('❌ WASM no encontrado');
    process.exit(1);
  }

  const wasm = fs.readFileSync(wasmPath);
  console.log(`📦 WASM: ${wasm.length} bytes\n`);

  const server = new StellarSdk.rpc.Server(RPC_URL, { allowHttp: true });
  const horizon = new StellarSdk.Horizon.Server(HORIZON_URL);
  const keypair = StellarSdk.Keypair.fromSecret(process.env.STELLAR_SECRET_KEY);
  const publicKey = keypair.publicKey();

  console.log(`🔑 Cuenta: ${publicKey}\n`);

  // 1. Upload WASM
  console.log('1️⃣ Subiendo WASM...');
  const account = await horizon.loadAccount(publicKey);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: '100000',
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

  const sim = await server.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(sim)) {
    console.error('❌ Error simulación:', sim.error);
    process.exit(1);
  }

  const preparedTx = await server.prepareTransaction(tx);
  preparedTx.sign(keypair);

  const sendResponse = await server.sendTransaction(preparedTx);
  console.log(`   TX: ${sendResponse.hash}`);

  // Esperar confirmación
  let txResult = await server.getTransaction(sendResponse.hash);
  let attempts = 0;
  while (txResult.status === StellarSdk.rpc.Api.GetTransactionStatus.NOT_FOUND && attempts < 30) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    txResult = await server.getTransaction(sendResponse.hash);
    attempts++;
  }

  if (txResult.status !== StellarSdk.rpc.Api.GetTransactionStatus.SUCCESS) {
    console.error('❌ Error confirmación');
    process.exit(1);
  }

  const wasmId = Buffer.from(txResult.resultRetVal.toXDR().value()).toString('hex');
  console.log(`✅ WASM ID: ${wasmId}\n`);

  // 2. Crear instancia del contrato
  console.log('2️⃣ Creando instancia del contrato...');

  const account2 = await horizon.loadAccount(publicKey);

  // Crear un contract ID único
  const contractIdPreimage = StellarSdk.xdr.HashIdPreimage.envelopeTypeContractId(
    new StellarSdk.xdr.ContractIdPreimage({
      networkId: StellarSdk.HashIdPreimage.networkId(NETWORK_PASSPHRASE),
      location: StellarSdk.xdr.ContractLocation.body(StellarSdk.xdr.ContractBody.create(
        wasmId,
        []
      ))
    })
  );

  const contractIdHash = StellarSdk.hash(contractIdPreimage.toXDR());
  const contractId = StellarSdk.StrKey.encodeEd25519PublicKey(contractIdHash);

  console.log(`   Contract ID: ${contractId}\n`);

  // Crear transacción para crear el contrato
  const tx2 = new StellarSdk.TransactionBuilder(account2, {
    fee: '100000',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .setTimeout(30)
    .addOperation(
      StellarSdk.Operation.invokeHostFunction({
        func: StellarSdk.HostFunctionType.createContract,
        args: [
          StellarSdk.xdr.ScVal.scvBytes(Buffer.from(wasmId, 'hex')),
          StellarSdk.xdr.ScVal.scvBytes(contractIdHash),
        ],
      })
    )
    .build();

  const sim2 = await server.simulateTransaction(tx2);
  if (StellarSdk.rpc.Api.isSimulationError(sim2)) {
    console.error('❌ Error simulación:', sim2.error);
    console.error('   Detalles:', JSON.stringify(sim2, null, 2));
    process.exit(1);
  }

  const preparedTx2 = await server.prepareTransaction(tx2);
  preparedTx2.sign(keypair);

  const sendResponse2 = await server.sendTransaction(preparedTx2);
  console.log(`   TX: ${sendResponse2.hash}`);

  // Esperar confirmación
  let txResult2 = await server.getTransaction(sendResponse2.hash);
  attempts = 0;
  while (txResult2.status === StellarSdk.rpc.Api.GetTransactionStatus.NOT_FOUND && attempts < 30) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    txResult2 = await server.getTransaction(sendResponse2.hash);
    attempts++;
  }

  if (txResult2.status !== StellarSdk.rpc.Api.GetTransactionStatus.SUCCESS) {
    console.error('❌ Error confirmación');
    console.error('   Estado:', txResult2.status);
    process.exit(1);
  }

  console.log(`✅ Instancia creada!\n`);

  console.log('📝 Agregá esto a tu .env:\n');
  console.log(`SOROBAN_CONTRACT_ID=${contractId}`);
  console.log('STELLAR_ENABLED=true\n');

  console.log('🔗 Ver en explorer:');
  console.log(`   https://stellar.expert/explorer/testnet/contract/${contractId}`);
}

deployContract().catch(err => {
  console.error('Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
