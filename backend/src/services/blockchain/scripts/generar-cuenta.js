/**
 * generar-cuenta.js
 *
 * Genera un par de claves Stellar y fondea la cuenta en testnet usando Friendbot.
 * Ejecutar UNA SOLA VEZ, guardar las claves en .env y NO commitear.
 *
 * Uso: node src/services/blockchain/scripts/generar-cuenta.js
 *
 * Faucet alternativo: https://lab.stellar.org/account/fund?$=network$id=testnet
 */

require('dotenv').config();
const StellarSdk = require('@stellar/stellar-sdk');

const FRIENDBOT_URL = 'https://friendbot.stellar.org';
const HORIZON_TESTNET = 'https://horizon-testnet.stellar.org';

async function main() {
  console.log('🌟 Generador de cuenta Stellar (Testnet)\n');

  // Generar par de claves
  const keypair = StellarSdk.Keypair.random();
  const publicKey = keypair.publicKey();
  const secretKey = keypair.secret();

  console.log('📋 Claves generadas:');
  console.log(`   Public Key: ${publicKey}`);
  console.log(`   Secret Key: ${secretKey}`);
  console.log('   ⚠️  Guardá la Secret Key en .env y NUNCA la commitees al repo\n');

  // Fondear con Friendbot
  console.log('💧 Fondeando cuenta con Friendbot...');
  try {
    const { default: fetch } = await import('node-fetch').catch(() => ({ default: globalThis.fetch }));
    const fetchFn = fetch || globalThis.fetch;
    const response = await fetchFn(`${FRIENDBOT_URL}?addr=${publicKey}`);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Friendbot respondió ${response.status}: ${text}`);
    }

    const data = await response.json();
    console.log(`✅ Cuenta fondeada! TX hash: ${data.hash || data._links?.transaction?.href || 'OK'}\n`);
  } catch (err) {
    console.error(`❌ Error al fondear: ${err.message}`);
    console.log('   Podés fondear manualmente en:');
    console.log(`   https://lab.stellar.org/account/fund?$=network$id=testnet\n`);
    console.log(`   O con curl: curl "https://friendbot.stellar.org?addr=${publicKey}"\n`);
  }

  // Verificar balance
  try {
    const server = new StellarSdk.Horizon.Server(HORIZON_TESTNET);
    const account = await server.loadAccount(publicKey);
    const xlmBalance = account.balances.find((b) => b.asset_type === 'native');
    console.log(`💰 Balance actual: ${xlmBalance?.balance || '?'} XLM\n`);
  } catch {
    console.log('   (No se pudo verificar balance aún — esperá unos segundos y verificá en Stellar Expert)\n');
  }

  console.log('📝 Agregá esto a tu .env:\n');
  console.log(`STELLAR_ENABLED=false`);
  console.log(`STELLAR_NETWORK=testnet`);
  console.log(`STELLAR_PUBLIC_KEY=${publicKey}`);
  console.log(`STELLAR_SECRET_KEY=${secretKey}`);
  console.log(`SOROBAN_CONTRACT_ID=  # <-- completar después del deploy`);
  console.log('\n🔗 Ver cuenta en explorer:');
  console.log(`   https://stellar.expert/explorer/testnet/account/${publicKey}`);
}

main().catch(console.error);
