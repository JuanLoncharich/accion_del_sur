/**
 * Comprehensive E2E Test: Centers, Transfers & Multi-Contract Blockchain
 *
 * Tests:
 * 1. Auth: Login to get token
 * 2. Centers: Create 2 centers (with blockchain deploy), list, get by id
 * 3. Donations: Create donation (token minted on contrato_donaciones)
 * 4. Assign item to center (registrar_ingreso on center contract)
 * 5. Transfers: Transfer item between centers (egreso + ingreso on-chain)
 * 6. Distribution: Full 4-step flow (entrega on contrato_entregas)
 * 7. Verify blockchain state
 * 8. Edge cases
 */

const BASE = 'http://localhost:3001/api';
let TOKEN = '';
let CENTER_A_ID, CENTER_B_ID;
let CENTER_A_CONTRACT, CENTER_B_CONTRACT;
let ITEM_ID, DONATION_ID;
let TRANSFER_ID;

const passed = [];
const failed = [];

async function api(method, path, body = null, token = TOKEN) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

function assert(name, condition, detail = '') {
  if (condition) {
    passed.push(name);
    console.log(`  ✅ ${name}`);
  } else {
    failed.push(name);
    console.log(`  ❌ ${name} ${detail}`);
  }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═══════════════════════════════════════════════════════════════════════════
// 1. AUTH
// ═══════════════════════════════════════════════════════════════════════════
async function testAuth() {
  console.log('\n═══ AUTH ═══');
  const r = await api('POST', '/auth/login', { username: 'admin', password: 'admin123' });
  assert('Login OK', r.status === 200 && r.data.token);
  TOKEN = r.data.token;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. CENTERS: Create + Deploy contracts
// ═══════════════════════════════════════════════════════════════════════════
async function testCenters() {
  console.log('\n═══ CENTERS ═══');

  // Create Center A
  console.log('  Creating Centro A (deploying contract on-chain)...');
  const rA = await api('POST', '/centers', {
    name: 'Centro Distribución Norte',
    latitude: -34.5708,
    longitude: -58.4370,
  });
  assert('Create Center A - status 201', rA.status === 201);
  assert('Center A has id', rA.data?.id > 0);
  assert('Center A has name', rA.data?.name === 'Centro Distribución Norte');

  if (rA.data?.id) {
    CENTER_A_ID = rA.data.id;
    CENTER_A_CONTRACT = rA.data.blockchain_contract_id;
    assert('Center A has blockchain_contract_id', !!CENTER_A_CONTRACT, `got: ${CENTER_A_CONTRACT}`);
    assert('Center A has deploy tx', !!rA.data.blockchain_deploy_tx);
    assert('Center A has init tx', !!rA.data.blockchain_init_tx);
    console.log(`    Contract A: ${CENTER_A_CONTRACT}`);
  }

  // Wait between deployments to avoid sequence conflicts
  await sleep(2000);

  // Create Center B
  console.log('  Creating Centro B (deploying contract on-chain)...');
  const rB = await api('POST', '/centers', {
    name: 'Centro Distribución Sur',
    latitude: -34.6500,
    longitude: -58.5100,
  });
  assert('Create Center B - status 201', rB.status === 201);
  assert('Center B has id', rB.data?.id > 0);

  if (rB.data?.id) {
    CENTER_B_ID = rB.data.id;
    CENTER_B_CONTRACT = rB.data.blockchain_contract_id;
    assert('Center B has blockchain_contract_id', !!CENTER_B_CONTRACT, `got: ${CENTER_B_CONTRACT}`);
    console.log(`    Contract B: ${CENTER_B_CONTRACT}`);
  }

  // List centers
  const rList = await api('GET', '/centers');
  assert('List centers - status 200', rList.status === 200);
  assert('List centers - has data', Array.isArray(rList.data?.data));
  assert('List centers - has >= 2', rList.data?.data?.length >= 2);

  // Get center by ID
  if (CENTER_A_ID) {
    const rGet = await api('GET', `/centers/${CENTER_A_ID}`);
    assert('Get Center A - status 200', rGet.status === 200);
    assert('Get Center A - correct name', rGet.data?.name === 'Centro Distribución Norte');
    assert('Get Center A - has geo_hash', !!rGet.data?.geo_hash);
  }

  // Get inventory (empty)
  if (CENTER_A_ID) {
    const rInv = await api('GET', `/centers/${CENTER_A_ID}/inventory`);
    assert('Center A inventory - status 200', rInv.status === 200);
    assert('Center A inventory - empty items', Array.isArray(rInv.data?.items) && rInv.data.items.length === 0);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. DONATION: Create with center assignment
// ═══════════════════════════════════════════════════════════════════════════
async function testDonation() {
  console.log('\n═══ DONATION ═══');

  // First get a category
  const rCats = await api('GET', '/categories');
  assert('List categories OK', rCats.status === 200);

  let categoryId;
  if (rCats.data?.data?.length > 0) {
    categoryId = rCats.data.data[0].id;
  } else {
    // Create one
    const rCat = await api('POST', '/categories', { name: 'Test Multi-Contrato' });
    categoryId = rCat.data?.id;
  }
  assert('Have category ID', !!categoryId);

  // Create donation with center info
  console.log('  Creating donation (minting token on contrato_donaciones)...');
  const rDon = await api('POST', '/donations', {
    category_id: categoryId,
    attributes: { tipo: 'alimento', subtipo: 'arroz' },
    quantity: 50,
    notes: 'Donación test multi-contrato',
    center_name: 'Centro Distribución Norte',
    center_latitude: -34.5708,
    center_longitude: -58.4370,
  });
  assert('Create donation - status 201', rDon.status === 201);
  assert('Donation has id', rDon.data?.id > 0);

  if (rDon.data?.id) {
    DONATION_ID = rDon.data.id;
    ITEM_ID = rDon.data.item_id;
    assert('Donation has item_id', !!ITEM_ID);
    assert('Donation has center_name', rDon.data.center_name === 'Centro Distribución Norte');
    assert('Donation has center_geo_hash', !!rDon.data.center_geo_hash);
    assert('Donation blockchain status', rDon.data.status === 'anchored' || rDon.data.status === 'pending');

    if (rDon.data.status === 'anchored') {
      assert('Donation has blockchain_hash', !!rDon.data.blockchain_hash);
      assert('Donation has blockchain_tx_id', !!rDon.data.blockchain_tx_id);
    }
  }

  // Assign item to Center A by updating current_center_id directly
  // In a real flow, the donation controller would do this, but for now we'll
  // register the item ingreso on the center contract via a transfer-like operation
  if (ITEM_ID && CENTER_A_ID) {
    // Update item location in DB
    const { sequelize } = require('../../src/models');
    await sequelize.query(`UPDATE items SET current_center_id = ${CENTER_A_ID} WHERE id = ${ITEM_ID}`);

    // Register ingreso on Center A's contract
    if (CENTER_A_CONTRACT) {
      const stellarService = require('../../src/services/blockchain/stellarService');
      try {
        console.log('  Registering item ingreso on Center A contract...');
        const ingResult = await stellarService.registrarIngresoCentro(CENTER_A_CONTRACT, {
          itemId: ITEM_ID,
          cantidad: 50,
          origen: 'donacion',
          motivo: 'Recepción de donación',
        });
        assert('Ingreso on Center A - anchored', ingResult.status === 'anchored');
        assert('Ingreso on Center A - has hash', !!ingResult.hash);
        console.log(`    Ingreso hash: ${ingResult.hash}`);
      } catch (e) {
        assert('Ingreso on Center A', false, e.message);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. TRANSFER: Move item from Center A to Center B
// ═══════════════════════════════════════════════════════════════════════════
async function testTransfer() {
  console.log('\n═══ TRANSFER ═══');

  if (!ITEM_ID || !CENTER_A_ID || !CENTER_B_ID) {
    console.log('  ⚠️ Skipping: missing prerequisites');
    return;
  }

  console.log(`  Transferring item ${ITEM_ID} from Center A to Center B...`);
  const rTransfer = await api('POST', '/transfers', {
    item_id: ITEM_ID,
    from_center_id: CENTER_A_ID,
    to_center_id: CENTER_B_ID,
    quantity: 50,
    reason: 'Redistribución a zona sur',
  });

  assert('Transfer - status 201', rTransfer.status === 201);

  if (rTransfer.data?.id) {
    TRANSFER_ID = rTransfer.data.id;
    assert('Transfer has id', !!TRANSFER_ID);
    assert('Transfer has item', rTransfer.data.item?.id === ITEM_ID);
    assert('Transfer from Center A', rTransfer.data.fromCenter?.id === CENTER_A_ID);
    assert('Transfer to Center B', rTransfer.data.toCenter?.id === CENTER_B_ID);
    assert('Transfer quantity', rTransfer.data.quantity === 50);
    assert('Transfer reason', rTransfer.data.reason === 'Redistribución a zona sur');

    // Check blockchain anchoring
    if (rTransfer.data.status === 'anchored') {
      assert('Transfer egreso hash', !!rTransfer.data.egreso_blockchain_hash);
      assert('Transfer egreso tx', !!rTransfer.data.egreso_blockchain_tx);
      assert('Transfer ingreso hash', !!rTransfer.data.ingreso_blockchain_hash);
      assert('Transfer ingreso tx', !!rTransfer.data.ingreso_blockchain_tx);
      console.log(`    Egreso hash: ${rTransfer.data.egreso_blockchain_hash}`);
      console.log(`    Ingreso hash: ${rTransfer.data.ingreso_blockchain_hash}`);
    } else {
      assert('Transfer blockchain status', rTransfer.data.status === 'pending' || rTransfer.data.status === 'failed',
        `status: ${rTransfer.data.status}`);
    }
  }

  // Verify item is now at Center B
  const rItem = await api('GET', `/items/${ITEM_ID}`);
  if (rItem.status === 200) {
    assert('Item now at Center B', rItem.data?.current_center_id === CENTER_B_ID);
  }

  // Verify Center B inventory
  const rInvB = await api('GET', `/centers/${CENTER_B_ID}/inventory`);
  assert('Center B inventory - status 200', rInvB.status === 200);
  assert('Center B inventory - has item', rInvB.data?.items?.some(i => i.id === ITEM_ID));

  // Verify Center A inventory is empty
  const rInvA = await api('GET', `/centers/${CENTER_A_ID}/inventory`);
  assert('Center A inventory - empty after transfer', rInvA.data?.items?.length === 0 || !rInvA.data?.items?.some(i => i.id === ITEM_ID));

  // List transfers
  const rList = await api('GET', `/transfers?item_id=${ITEM_ID}`);
  assert('List transfers by item - status 200', rList.status === 200);
  assert('List transfers - has data', rList.data?.data?.length >= 1);

  const rListCenter = await api('GET', `/transfers?center_id=${CENTER_A_ID}`);
  assert('List transfers by center - status 200', rListCenter.status === 200);
  assert('List transfers by center - has data', rListCenter.data?.data?.length >= 1);
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. DISTRIBUTION: Full 4-step flow (uses contrato_entregas)
// ═══════════════════════════════════════════════════════════════════════════
async function testDistribution() {
  console.log('\n═══ DISTRIBUTION (4-step) ═══');

  if (!ITEM_ID) {
    console.log('  ⚠️ Skipping: no item');
    return;
  }

  // Step 1: Prepare
  console.log('  Step 1: Prepare...');
  const rPrep = await api('POST', '/distributions/prepare', {
    item_id: ITEM_ID,
    quantity: 5,
    notes: 'Entrega test multi-contrato',
    center_name: 'Centro Distribución Sur',
    center_latitude: -34.6500,
    center_longitude: -58.5100,
  });
  assert('Prepare - status 201', rPrep.status === 201);
  const distId = rPrep.data?.id;
  assert('Prepare - has id', !!distId);
  assert('Prepare - status draft', rPrep.data?.status === 'draft');

  if (!distId) return;

  // Step 2: Identify
  console.log('  Step 2: Identify...');
  const rId = await api('POST', `/distributions/${distId}/identify-manual`, {
    receiver_identifier: '12345678',
    doc_type: 'DNI',
  });
  assert('Identify - status 200', rId.status === 200);
  assert('Identify - status identified', rId.data?.status === 'identified');
  assert('Identify - has commitment', !!rId.data?.recipient_commitment);

  // Step 3: Sign
  console.log('  Step 3: Sign...');
  const rSign = await api('POST', `/distributions/${distId}/sign`, {
    signature_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  });
  assert('Sign - status 200', rSign.status === 200);
  assert('Sign - status signed', rSign.data?.status === 'signed');
  assert('Sign - has signature_hash', !!rSign.data?.signature_hash);

  // Step 4: Finalize (anchors to contrato_entregas)
  console.log('  Step 4: Finalize (anchoring to contrato_entregas)...');
  const rFin = await api('POST', `/distributions/${distId}/finalize`);
  assert('Finalize - status 200 or 202', rFin.status === 200 || rFin.status === 202);

  if (rFin.status === 200) {
    assert('Finalize - status anchored', rFin.data?.status === 'anchored');
    assert('Finalize - has blockchain_hash', !!rFin.data?.blockchain_hash);
    assert('Finalize - has blockchain_tx_id', !!rFin.data?.blockchain_tx_id);
    assert('Finalize - has finalized_at', !!rFin.data?.finalized_at);
    console.log(`    Blockchain hash: ${rFin.data?.blockchain_hash}`);
    console.log(`    Blockchain tx: ${rFin.data?.blockchain_tx_id}`);
  } else {
    assert('Finalize - pending_anchor', rFin.data?.status === 'pending_anchor');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. BLOCKCHAIN VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════
async function testBlockchainVerification() {
  console.log('\n═══ BLOCKCHAIN VERIFICATION ═══');

  if (!CENTER_A_CONTRACT || !CENTER_B_CONTRACT) {
    console.log('  ⚠️ Skipping: no contracts');
    return;
  }

  const stellarService = require('../../src/services/blockchain/stellarService');

  // Verify token exists on contrato_donaciones
  if (ITEM_ID) {
    console.log('  Verifying token on contrato_donaciones...');
    const tokenResult = await stellarService.verifyToken(ITEM_ID);
    assert('Token verified on donaciones contract', tokenResult.verified === true);
  }

  // Verify Center A contract info
  console.log('  Verifying Center A contract info...');
  try {
    const infoA = await stellarService.obtenerInfoCentro(CENTER_A_CONTRACT);
    assert('Center A on-chain info exists', !!infoA);
    if (infoA) {
      console.log(`    Center A nombre: ${infoA.nombre || JSON.stringify(infoA)}`);
    }
  } catch (e) {
    assert('Center A on-chain info', false, e.message);
  }

  // Verify Center B has item (after transfer)
  if (ITEM_ID) {
    console.log('  Checking if Center B has item on-chain...');
    try {
      const hasItem = await stellarService.tieneItemCentro(CENTER_B_CONTRACT, ITEM_ID);
      assert('Center B has item on-chain', hasItem === true);
    } catch (e) {
      assert('Center B has item on-chain', false, e.message);
    }

    // Verify Center A does NOT have item (after transfer)
    try {
      const hasItemA = await stellarService.tieneItemCentro(CENTER_A_CONTRACT, ITEM_ID);
      assert('Center A does NOT have item on-chain', hasItemA === false);
    } catch (e) {
      assert('Center A does NOT have item on-chain', false, e.message);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════
async function testEdgeCases() {
  console.log('\n═══ EDGE CASES ═══');

  // Transfer to same center
  const rSame = await api('POST', '/transfers', {
    item_id: ITEM_ID, from_center_id: CENTER_B_ID, to_center_id: CENTER_B_ID,
    quantity: 1, reason: 'Self transfer',
  });
  assert('Transfer to same center - 400', rSame.status === 400);

  // Transfer from wrong center
  const rWrong = await api('POST', '/transfers', {
    item_id: ITEM_ID, from_center_id: CENTER_A_ID, to_center_id: CENTER_B_ID,
    quantity: 1, reason: 'Wrong center',
  });
  assert('Transfer from wrong center - 409', rWrong.status === 409);

  // Get non-existent center
  const rNone = await api('GET', '/centers/9999');
  assert('Get non-existent center - 404', rNone.status === 404);

  // Get non-existent transfer
  const rNoTrans = await api('GET', '/transfers/9999');
  assert('Get non-existent transfer - 404', rNoTrans.status === 404);

  // Deactivate center
  if (CENTER_A_ID) {
    const rDeact = await api('DELETE', `/centers/${CENTER_A_ID}`);
    assert('Deactivate Center A - 200', rDeact.status === 200);

    // Verify deactivated
    const rCheck = await api('GET', `/centers/${CENTER_A_ID}`);
    assert('Center A is_active false', rCheck.data?.is_active === false);

    // Transfer to deactivated center should fail
    const rDeactTrans = await api('POST', '/transfers', {
      item_id: ITEM_ID, from_center_id: CENTER_B_ID, to_center_id: CENTER_A_ID,
      quantity: 1, reason: 'To inactive',
    });
    assert('Transfer to inactive center - 404', rDeactTrans.status === 404);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('🚀 COMPREHENSIVE MULTI-CONTRACT TEST\n');
  console.log('Contracts:');
  console.log(`  Donaciones: ${process.env.SOROBAN_CONTRACT_DONACIONES || 'env not set'}`);
  console.log(`  Entregas:   ${process.env.SOROBAN_CONTRACT_ENTREGAS || 'env not set'}`);
  console.log(`  Centro WASM: ${process.env.CENTRO_WASM_HASH ? 'configured' : 'not set'}`);

  await testAuth();
  await testCenters();
  await testDonation();
  await testTransfer();
  await testDistribution();
  await testBlockchainVerification();
  await testEdgeCases();

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`RESULTADO: ${passed.length}/${passed.length + failed.length} tests pasaron`);
  if (failed.length === 0) {
    console.log('✅ TODOS LOS TESTS PASARON');
  } else {
    console.log(`❌ ${failed.length} tests fallaron:`);
    failed.forEach(f => console.log(`   - ${f}`));
  }
  console.log(`${'═'.repeat(60)}\n`);

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
