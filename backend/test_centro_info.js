// Test para verificar info de contratos de centro
require('dotenv').config();
const stellarService = require('./src/services/blockchain/stellarService');

async function testCentroInfo() {
  console.log('==========================================');
  console.log('VERIFICANDO CONTRATOS DE CENTRO');
  console.log('==========================================');
  console.log('');

  const centros = [
    { id: 10, name: 'Centro Local Flores', contract: 'CASKOVKN4T4UZKYIJLPZZIHBLVC5TYUB3UDTUBINKJKCT62BGJZEB63B' },
    { id: 9, name: 'Centro Regional Buenos Aires', contract: 'CBMX3CHJYP5B2T7T3CQY7SI7T2LMASNCYD5IDWCFQPG4JJJUBSW3M23L' },
  ];

  for (const centro of centros) {
    console.log(`------------------------------------------`);
    console.log(`Centro: ${centro.name} (ID: ${centro.id})`);
    console.log(`Contract: ${centro.contract}`);
    console.log('');

    try {
      console.log('1. Obteniendo info del centro...');
      const info = await stellarService.obtenerInfoCentro(centro.contract);
      console.log('✅ Info obtenida:');
      console.log('   ', JSON.stringify(info, null, 2));
      console.log('');
    } catch (error) {
      console.error('❌ Error obteniendo info:');
      console.error('   ', error.message);
      console.log('');
    }

    try {
      console.log('2. Obteniendo inventario del centro...');
      const inventario = await stellarService.obtenerInventarioCentro(centro.contract);
      console.log('✅ Inventario obtenido:');
      console.log('   Items:', inventario.items.length);
      console.log('   Status:', inventario.status);
      if (inventario.items.length > 0) {
        console.log('   Primeros items:');
        inventario.items.slice(0, 3).forEach(item => {
          console.log('     ', JSON.stringify(item));
        });
      }
      console.log('');
    } catch (error) {
      console.error('❌ Error obteniendo inventario:');
      console.error('   ', error.message);
      console.log('');
    }

    try {
      console.log('3. Verificando si tiene item 22...');
      const tieneItem = await stellarService.tieneItemCentro(centro.contract, 22);
      console.log('✅ Tiene item 22:', tieneItem);
      console.log('');
    } catch (error) {
      console.error('❌ Error verificando item:');
      console.error('   ', error.message);
      console.log('');
    }
  }

  console.log('==========================================');
  console.log('TEST COMPLETADO');
  console.log('==========================================');
}

testCentroInfo().catch(error => {
  console.error('Error fatal:', error);
  process.exit(1);
});
