/**
 * Genera una cuenta Stellar de testnet, la fondea con Friendbot y la guarda en backend/.env
 * (STELLAR_SECRET_KEY / STELLAR_PUBLIC_KEY). Esta cuenta es la administradora de los contratos
 * y firma todas las transacciones del backend.
 *
 *   npm run stellar:cuenta              # no pisa una clave existente
 *   npm run stellar:cuenta -- --forzar  # reemplaza la clave actual
 *
 * La clave secreta queda solo en backend/.env (ignorado por git). Nunca la commitees.
 */
const StellarSdk = require('@stellar/stellar-sdk');
const env = require('./envFile');

async function main() {
  env.cargar();
  if (process.env.STELLAR_SECRET_KEY && !process.argv.includes('--forzar')) {
    const actual = StellarSdk.Keypair.fromSecret(process.env.STELLAR_SECRET_KEY).publicKey();
    console.log(`Ya hay una cuenta configurada: ${actual}`);
    console.log('Usá --forzar para generar otra (los contratos desplegados con la anterior dejarán de ser administrables).');
    return;
  }
  if ((process.env.STELLAR_NETWORK || 'testnet') !== 'testnet') {
    throw new Error('Este script solo fondea cuentas de testnet. En mainnet la cuenta se crea y fondea a mano.');
  }

  const keypair = StellarSdk.Keypair.random();
  console.log(`Cuenta generada: ${keypair.publicKey()}`);

  const res = await fetch(`https://friendbot.stellar.org?addr=${keypair.publicKey()}`);
  if (!res.ok) throw new Error(`Friendbot respondió ${res.status}: ${await res.text()}`);
  console.log('Fondeada con Friendbot (10.000 XLM de testnet).');

  env.actualizar({
    STELLAR_PUBLIC_KEY: keypair.publicKey(),
    STELLAR_SECRET_KEY: keypair.secret(),
  });
  console.log(`Guardada en ${env.ENV_PATH}.`);
  console.log(`Explorador: https://stellar.expert/explorer/testnet/account/${keypair.publicKey()}`);
}

main().catch((e) => { console.error(`Error: ${e.message}`); process.exit(1); });
