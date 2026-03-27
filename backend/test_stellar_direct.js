// Test directo de Stellar para transferencias
require('dotenv').config();
const stellarService = require('./src/services/blockchain/stellarService');

async function testTransferencia() {
  console.log('==========================================');
  console.log('TEST DIRECTO STELLAR - TRANSFERENCIAS');
  console.log('==========================================');
  console.log('');

  console.log('Stellar Service Status:');
  console.log('  Enabled:', stellarService.isEnabled);
  console.log('  Network:', stellarService.networkName);
  console.log('  Keypair:', stellarService.keypair ? 'Configured' : 'NOT configured');
  console.log('  Public Key:', stellarService.keypair?.publicKey());
  console.log('');

  // Contract IDs de centros reales (del test anterior)
  const fromContract = 'CASKOVKN4T4UZKYIJLPZZIHBLVC5TYUB3UDTUBINKJKCT62BGJZEB63B'; // Centro 10
  const toContract = 'CBMX3CHJYP5B2T7T3CQY7SI7T2LMASNCYD5IDWCFQPG4JJJUBSW3M23L'; // Centro 9

  console.log('Contratos a probar:');
  console.log('  From Contract:', fromContract);
  console.log('  To Contract:', toContract);
  console.log('');

  const itemId = 22;
  const cantidad = 10;

  try {
    console.log('1. Probando registrarEgresoCentro...');
    console.log('   Contract:', fromContract);
    console.log('   Item ID:', itemId);
    console.log('   Cantidad:', cantidad);
    console.log('   Destino:', toContract);
    console.log('');

    const egresoResult = await stellarService.registrarEgresoCentro(
      fromContract,
      {
        itemId: itemId,
        cantidad: cantidad,
        destino: toContract,
        motivo: 'Test directo',
      }
    );

    console.log('✅ EXITO - registrarEgresoCentro');
    console.log('   Hash:', egresoResult.hash);
    console.log('   TX ID:', egresoResult.txId);
    console.log('   Status:', egresoResult.status);
    console.log('');

  } catch (error) {
    console.error('❌ ERROR - registrarEgresoCentro');
    console.error('   Error Name:', error.name);
    console.error('   Error Message:', error.message);
    console.error('   Error Code:', error.code);
    console.error('   Error Stack:');
    console.error(error.stack);
    console.error('');
  }

  try {
    console.log('2. Probando registrarIngresoCentro...');
    console.log('   Contract:', toContract);
    console.log('   Item ID:', itemId);
    console.log('   Cantidad:', cantidad);
    console.log('   Origen:', fromContract);
    console.log('');

    const ingresoResult = await stellarService.registrarIngresoCentro(
      toContract,
      {
        itemId: itemId,
        cantidad: cantidad,
        origen: fromContract,
        motivo: 'Test directo',
      }
    );

    console.log('✅ EXITO - registrarIngresoCentro');
    console.log('   Hash:', ingresoResult.hash);
    console.log('   TX ID:', ingresoResult.txId);
    console.log('   Status:', ingresoResult.status);
    console.log('');

  } catch (error) {
    console.error('❌ ERROR - registrarIngresoCentro');
    console.error('   Error Name:', error.name);
    console.error('   Error Message:', error.message);
    console.error('   Error Code:', error.code);
    console.error('   Error Stack:');
    console.error(error.stack);
    console.error('');
  }

  console.log('==========================================');
  console.log('TEST COMPLETADO');
  console.log('==========================================');
}

testTransferencia().catch(error => {
  console.error('Error fatal:', error);
  process.exit(1);
});
