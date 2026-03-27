#!/usr/bin/env node
/**
 * full-api-test.js — Test completo de todos los endpoints de la API
 * Cubre: auth, categories, donations, items, distributions, audit, users, dashboard
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const API_BASE = process.env.E2E_API_BASE || `http://localhost:${process.env.PORT || 3001}/api`;

let passed = 0;
let failed = 0;
const failures = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const req = async (url, { method = 'GET', token, body, form } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let fetchBody;
  if (form) {
    fetchBody = form;
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
  }

  const res = await fetch(url, { method, headers, body: fetchBody });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
};

const check = (name, condition, detail = '') => {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
    failed++;
    failures.push({ name, detail });
  }
};

const section = (title) => console.log(`\n── ${title} ──`);

// ─── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`\n🧪 Full API Test — ${API_BASE}\n`);

  // ══════════════════════════════════════════════════════════════
  // AUTH
  // ══════════════════════════════════════════════════════════════
  section('AUTH');

  // Login correcto
  let r = await req(`${API_BASE}/auth/login`, { method: 'POST', body: { username: 'admin', password: 'admin123' } });
  check('POST /auth/login → 200', r.status === 200, `status=${r.status}`);
  check('Login devuelve token', !!r.data.token, JSON.stringify(r.data));
  check('Login devuelve user', !!r.data.user?.username);
  const adminToken = r.data.token;
  const adminId = r.data.user?.id;

  // Login incorrecto
  r = await req(`${API_BASE}/auth/login`, { method: 'POST', body: { username: 'admin', password: 'wrong' } });
  check('POST /auth/login con clave mala → 401', r.status === 401, `status=${r.status}`);

  // GET /me
  r = await req(`${API_BASE}/auth/me`, { token: adminToken });
  check('GET /auth/me → 200', r.status === 200, `status=${r.status}`);
  check('/auth/me devuelve username', r.data.username === 'admin');

  // GET /me sin token
  r = await req(`${API_BASE}/auth/me`);
  check('GET /auth/me sin token → 401', r.status === 401, `status=${r.status}`);

  // ══════════════════════════════════════════════════════════════
  // USERS
  // ══════════════════════════════════════════════════════════════
  section('USERS');

  r = await req(`${API_BASE}/users`, { token: adminToken });
  check('GET /users → 200', r.status === 200, `status=${r.status}`);
  check('/users devuelve array', Array.isArray(r.data), typeof r.data);

  // Crear user de prueba
  const testUsername = `testuser_${Date.now()}`;
  r = await req(`${API_BASE}/users`, {
    method: 'POST', token: adminToken,
    body: { username: testUsername, email: `${testUsername}@test.com`, password: 'Test1234!', role: 'logistica' },
  });
  check('POST /users → 201', r.status === 201, `status=${r.status} ${JSON.stringify(r.data)}`);
  check('User creado tiene id', !!r.data.id);
  const testUserId = r.data.id;

  // Login con nuevo user
  r = await req(`${API_BASE}/auth/login`, { method: 'POST', body: { username: testUsername, password: 'Test1234!' } });
  check('Nuevo user puede hacer login', r.status === 200 && !!r.data.token, `status=${r.status}`);
  const logisticaToken = r.data.token;

  // Actualizar user
  r = await req(`${API_BASE}/users/${testUserId}`, {
    method: 'PUT', token: adminToken,
    body: { username: testUsername, email: `${testUsername}@test.com`, role: 'logistica' },
  });
  check('PUT /users/:id → 200', r.status === 200, `status=${r.status} ${JSON.stringify(r.data)}`);

  // Borrar user de prueba
  r = await req(`${API_BASE}/users/${testUserId}`, { method: 'DELETE', token: adminToken });
  check('DELETE /users/:id → 200', r.status === 200, `status=${r.status}`);

  // ══════════════════════════════════════════════════════════════
  // CATEGORIES
  // ══════════════════════════════════════════════════════════════
  section('CATEGORIES');

  r = await req(`${API_BASE}/categories`, { token: adminToken });
  check('GET /categories → 200', r.status === 200, `status=${r.status}`);
  check('/categories devuelve array', Array.isArray(r.data));
  check('/categories tiene al menos 1', r.data.length > 0, `count=${r.data.length}`);
  const categories = r.data;
  const catConAtribs = categories.find((c) => (c.attributes || []).length > 0) || categories[0];

  // Crear categoría
  const catName = `TestCat_${Date.now()}`;
  r = await req(`${API_BASE}/categories`, {
    method: 'POST', token: adminToken,
    body: { name: catName, description: 'Categoría de test' },
  });
  check('POST /categories → 201', r.status === 201, `status=${r.status}`);
  check('Categoría creada tiene id', !!r.data.id);
  const testCatId = r.data.id;

  // Actualizar categoría
  r = await req(`${API_BASE}/categories/${testCatId}`, {
    method: 'PUT', token: adminToken,
    body: { name: catName + '_upd', description: 'Updated' },
  });
  check('PUT /categories/:id → 200', r.status === 200, `status=${r.status}`);

  // Agregar atributo
  r = await req(`${API_BASE}/categories/${testCatId}/attributes`, {
    method: 'POST', token: adminToken,
    body: { attribute_name: 'Talle', attribute_type: 'select', options: ['S', 'M', 'L'], is_required: true, display_order: 1 },
  });
  check('POST /categories/:id/attributes → 201', r.status === 201, `status=${r.status}`);
  check('Atributo creado tiene id', !!r.data.id);
  const testAttrId = r.data.id;

  // GET atributos
  r = await req(`${API_BASE}/categories/${testCatId}/attributes`, { token: adminToken });
  check('GET /categories/:id/attributes → 200', r.status === 200, `status=${r.status}`);
  check('Atributo aparece en listado', Array.isArray(r.data) && r.data.some((a) => a.id === testAttrId));

  // Actualizar atributo
  r = await req(`${API_BASE}/categories/${testCatId}/attributes/${testAttrId}`, {
    method: 'PUT', token: adminToken,
    body: { attribute_name: 'Talle', attribute_type: 'select', options: ['S', 'M', 'L', 'XL'], is_required: true, display_order: 1 },
  });
  check('PUT /categories/:id/attributes/:attrId → 200', r.status === 200, `status=${r.status}`);

  // Eliminar atributo
  r = await req(`${API_BASE}/categories/${testCatId}/attributes/${testAttrId}`, {
    method: 'DELETE', token: adminToken,
  });
  check('DELETE /categories/:id/attributes/:attrId → 200', r.status === 200, `status=${r.status}`);

  // Desactivar categoría
  r = await req(`${API_BASE}/categories/${testCatId}`, { method: 'DELETE', token: adminToken });
  check('DELETE /categories/:id → 200', r.status === 200, `status=${r.status}`);

  // ══════════════════════════════════════════════════════════════
  // DONATIONS
  // ══════════════════════════════════════════════════════════════
  section('DONATIONS');

  // Stats antes
  r = await req(`${API_BASE}/donations/stats`, { token: adminToken });
  check('GET /donations/stats → 200', r.status === 200, `status=${r.status}`);
  check('/donations/stats tiene totalDonations', typeof r.data.totalDonations === 'number');
  check('/donations/stats tiene weeklyDonations', Array.isArray(r.data.weeklyDonations));
  const prevDonationCount = r.data.totalDonations;

  // List con paginación
  r = await req(`${API_BASE}/donations?page=1&limit=5`, { token: adminToken });
  check('GET /donations → 200', r.status === 200, `status=${r.status}`);
  check('/donations tiene total', typeof r.data.total === 'number');
  check('/donations tiene data array', Array.isArray(r.data.data));
  check('/donations respeta limit', r.data.data.length <= 5);

  // Crear donación con geolocalización (FormData)
  const donForm = new FormData();
  donForm.append('category_id', String(catConAtribs.id));
  donForm.append('attributes', JSON.stringify({ test: 'apitest' }));
  donForm.append('quantity', '5');
  donForm.append('notes', 'Test donacion completa');
  donForm.append('center_name', 'Centro Test API');
  donForm.append('center_latitude', '-34.603722');
  donForm.append('center_longitude', '-58.381592');

  r = await req(`${API_BASE}/donations`, { method: 'POST', token: adminToken, form: donForm });
  check('POST /donations → 201', r.status === 201, `status=${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
  check('Donación creada tiene id', !!r.data.id);
  check('Donación tiene item_id', !!r.data.item_id);
  check('Donación tiene center_name', r.data.center_name === 'Centro Test API', `got=${r.data.center_name}`);
  check('Donación tiene center_latitude', r.data.center_latitude !== null && r.data.center_latitude !== undefined);
  check('Donación tiene center_geo_hash', !!r.data.center_geo_hash, `got=${r.data.center_geo_hash}`);
  check('Donación tiene status', !!r.data.status, `got=${r.data.status}`);
  const donId = r.data.id;
  const itemId = r.data.item_id;

  // Verificar persistencia: buscar por id en el listado
  r = await req(`${API_BASE}/donations?page=1&limit=50`, { token: adminToken });
  const donRow = r.data.data.find((d) => d.id === donId);
  check('Donación aparece en listado', !!donRow, `donId=${donId}`);
  check('center_name persistido', donRow?.center_name === 'Centro Test API', `got=${donRow?.center_name}`);
  check('center_latitude persistido', donRow?.center_latitude !== null, `got=${donRow?.center_latitude}`);
  check('center_longitude persistido', donRow?.center_longitude !== null, `got=${donRow?.center_longitude}`);
  check('center_geo_hash persistido', !!donRow?.center_geo_hash, `got=${donRow?.center_geo_hash}`);
  check('status persistido', !!donRow?.status, `got=${donRow?.status}`);
  check('blockchain_tx_id persistido', !!donRow?.blockchain_tx_id, `got=${donRow?.blockchain_tx_id}`);
  check('blockchain_hash persistido', !!donRow?.blockchain_hash, `got=${donRow?.blockchain_hash}`);

  // Stats aumentaron
  r = await req(`${API_BASE}/donations/stats`, { token: adminToken });
  check('totalDonations aumentó tras crear', r.data.totalDonations > prevDonationCount, `prev=${prevDonationCount} now=${r.data.totalDonations}`);

  // Sin token → 401
  r = await req(`${API_BASE}/donations`);
  check('GET /donations sin token → 401', r.status === 401, `status=${r.status}`);

  // Crear sin campos requeridos → 400
  const badForm = new FormData();
  badForm.append('quantity', '1');
  r = await req(`${API_BASE}/donations`, { method: 'POST', token: adminToken, form: badForm });
  check('POST /donations sin category_id → 400', r.status === 400, `status=${r.status}`);

  // ══════════════════════════════════════════════════════════════
  // ITEMS
  // ══════════════════════════════════════════════════════════════
  section('ITEMS');

  r = await req(`${API_BASE}/items?page=1&limit=10`, { token: adminToken });
  check('GET /items → 200', r.status === 200, `status=${r.status}`);
  check('/items tiene total', typeof r.data.total === 'number');
  check('/items tiene data array', Array.isArray(r.data.data));
  check('/items con stock tiene blockchain_hash', r.data.data.some((i) => !!i.blockchain_hash), 'ninguno tiene blockchain_hash');

  // Buscar el item creado con la donación
  const itemRow = r.data.data.find((i) => i.id === itemId);
  check('Item de donación aparece en /items', !!itemRow, `itemId=${itemId}`);
  check('Item tiene token_status', !!itemRow?.token_status, `got=${itemRow?.token_status}`);
  check('Item tiene quantity > 0', itemRow?.quantity > 0, `got=${itemRow?.quantity}`);

  // GET item individual
  r = await req(`${API_BASE}/items/${itemId}`, { token: adminToken });
  check('GET /items/:id → 200', r.status === 200, `status=${r.status}`);
  check('Item individual tiene id correcto', r.data.id === itemId);
  check('Item individual tiene category', !!r.data.category?.name);
  check('Item individual tiene donations', Array.isArray(r.data.donations), `got=${typeof r.data.donations}`);

  // GET item inexistente → 404
  r = await req(`${API_BASE}/items/999999`, { token: adminToken });
  check('GET /items/:id inexistente → 404', r.status === 404, `status=${r.status}`);

  // Stock por categoría
  r = await req(`${API_BASE}/items/stock-by-category`, { token: adminToken });
  check('GET /items/stock-by-category → 200', r.status === 200, `status=${r.status}`);
  check('/stock-by-category devuelve array', Array.isArray(r.data), typeof r.data);

  // Export CSV
  const csvHeaders = {};
  if (adminToken) csvHeaders.Authorization = `Bearer ${adminToken}`;
  const csvRes = await fetch(`${API_BASE}/items/export/csv`, { headers: csvHeaders });
  check('GET /items/export/csv → 200', csvRes.status === 200, `status=${csvRes.status}`);
  check('/items/export/csv es text/csv', csvRes.headers.get('content-type')?.includes('csv'), `ct=${csvRes.headers.get('content-type')}`);

  // Filtro por categoría
  r = await req(`${API_BASE}/items?category_id=${catConAtribs.id}`, { token: adminToken });
  check('GET /items?category_id → filtra correctamente', r.status === 200 && r.data.data.every((i) => i.category_id === catConAtribs.id || i.category?.id === catConAtribs.id));

  // ══════════════════════════════════════════════════════════════
  // DISTRIBUTIONS — flujo completo
  // ══════════════════════════════════════════════════════════════
  section('DISTRIBUTIONS');

  // Stats
  r = await req(`${API_BASE}/distributions/stats`, { token: adminToken });
  check('GET /distributions/stats → 200', r.status === 200, `status=${r.status}`);
  check('/distributions/stats tiene totalDistributions', typeof r.data.totalDistributions === 'number');
  const prevDistCount = r.data.totalDistributions;

  // List
  r = await req(`${API_BASE}/distributions?page=1&limit=10`, { token: adminToken });
  check('GET /distributions → 200', r.status === 200, `status=${r.status}`);
  check('/distributions tiene total', typeof r.data.total === 'number');

  // Encontrar item con stock
  r = await req(`${API_BASE}/items?limit=50`, { token: adminToken });
  const itemConStock = r.data.data.find((i) => i.quantity > 0);
  check('Hay item con stock para distribuir', !!itemConStock, 'no hay items con stock');

  if (itemConStock) {
    const stockAntes = itemConStock.quantity;

    // PASO 1: prepare
    r = await req(`${API_BASE}/distributions/prepare`, {
      method: 'POST', token: adminToken,
      body: {
        item_id: itemConStock.id,
        quantity: 1,
        notes: 'Test distribución completa',
        center_name: 'Centro Test Dist',
        center_latitude: -34.603722,
        center_longitude: -58.381592,
      },
    });
    check('POST /distributions/prepare → 201', r.status === 201, `status=${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
    check('prepare tiene id', !!r.data.id);
    check('prepare tiene status=draft', r.data.status === 'draft', `got=${r.data.status}`);
    check('prepare tiene nonce', !!r.data.nonce);
    check('prepare tiene expires_at', !!r.data.expires_at);
    check('prepare tiene center_name', r.data.center_name === 'Centro Test Dist', `got=${r.data.center_name}`);
    const distId = r.data.id;

    // prepare duplicado mismo item → 201 (nuevo borrador, no error)
    r = await req(`${API_BASE}/distributions/prepare`, {
      method: 'POST', token: adminToken,
      body: { item_id: itemConStock.id, quantity: 1, center_name: 'X', center_latitude: 0, center_longitude: 0 },
    });
    check('prepare segundo borrador → 201', r.status === 201, `status=${r.status}`);
    const extraDraftId = r.data.id;

    // PASO 2: identify-manual
    r = await req(`${API_BASE}/distributions/${distId}/identify-manual`, {
      method: 'POST', token: adminToken,
      body: { receiver_identifier: '30555444', doc_type: 'DNI' },
    });
    check('POST /distributions/:id/identify-manual → 200', r.status === 200, `status=${r.status} ${JSON.stringify(r.data)}`);
    check('identify devuelve status=identified', r.data.status === 'identified', `got=${r.data.status}`);
    check('identify devuelve recipient_commitment', !!r.data.recipient_commitment);

    // identify en estado incorrecto → 409
    r = await req(`${API_BASE}/distributions/${distId}/identify-manual`, {
      method: 'POST', token: adminToken,
      body: { receiver_identifier: '30555444', doc_type: 'DNI' },
    });
    check('identify en estado no-draft → 409', r.status === 409, `status=${r.status}`);

    // sign sin identify primero → 409
    r = await req(`${API_BASE}/distributions/${extraDraftId}/sign`, {
      method: 'POST', token: adminToken,
      body: { signature_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBgLJrVN4AAAAASUVORK5CYII=', signature_mime: 'image/png' },
    });
    check('sign sin identify previo → 409', r.status === 409, `status=${r.status}`);

    // PASO 3: sign
    const onePixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBgLJrVN4AAAAASUVORK5CYII=';
    r = await req(`${API_BASE}/distributions/${distId}/sign`, {
      method: 'POST', token: adminToken,
      body: { signature_data: onePixel, signature_mime: 'image/png' },
    });
    check('POST /distributions/:id/sign → 200', r.status === 200, `status=${r.status} ${JSON.stringify(r.data)}`);
    check('sign devuelve status=signed', r.data.status === 'signed', `got=${r.data.status}`);
    check('sign devuelve signature_hash', !!r.data.signature_hash);

    // finalize sin sign previo (usar extraDraft, que está en draft) → 409
    r = await req(`${API_BASE}/distributions/${extraDraftId}/finalize`, {
      method: 'POST', token: adminToken,
    });
    check('finalize sin sign → 409', r.status === 409, `status=${r.status}`);

    // PASO 4: finalize
    r = await req(`${API_BASE}/distributions/${distId}/finalize`, {
      method: 'POST', token: adminToken,
    });
    check('POST /distributions/:id/finalize → 200', r.status === 200, `status=${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
    check('finalize status=anchored', r.data.status === 'anchored', `got=${r.data.status}`);
    check('finalize tiene blockchain_tx_id', !!r.data.blockchain_tx_id, `got=${r.data.blockchain_tx_id}`);
    check('finalize tiene blockchain_hash', !!r.data.blockchain_hash, `got=${r.data.blockchain_hash}`);
    check('finalize tiene finalized_at', !!r.data.finalized_at, `got=${r.data.finalized_at}`);
    check('finalize tiene receipt_hash', !!r.data.receipt_hash, `got=${r.data.receipt_hash}`);
    check('finalize tiene receipt_payload', !!r.data.receipt_payload);
    check('finalize tiene recipient_commitment', !!r.data.recipient_commitment);

    // Verificar stock descontado
    r = await req(`${API_BASE}/items/${itemConStock.id}`, { token: adminToken });
    check('Stock descontado tras finalize', r.data.quantity === stockAntes - 1, `antes=${stockAntes} ahora=${r.data.quantity}`);

    // finalize segunda vez → 409
    r = await req(`${API_BASE}/distributions/${distId}/finalize`, {
      method: 'POST', token: adminToken,
    });
    check('finalize segunda vez → 409', r.status === 409, `status=${r.status}`);

    // Verificar en listado
    r = await req(`${API_BASE}/distributions?page=1&limit=50`, { token: adminToken });
    const distRow = r.data.data.find((d) => d.id === distId);
    check('Distribución aparece en listado', !!distRow, `distId=${distId}`);
    check('Distribución tiene status=anchored en listado', distRow?.status === 'anchored', `got=${distRow?.status}`);

    // Stats aumentaron
    r = await req(`${API_BASE}/distributions/stats`, { token: adminToken });
    check('totalDistributions aumentó', r.data.totalDistributions > prevDistCount, `prev=${prevDistCount} now=${r.data.totalDistributions}`);

    // ══════════════════════════════════════════════════════════════
    // AUDIT
    // ══════════════════════════════════════════════════════════════
    section('AUDIT');

    // Public audit — sin token
    r = await req(`${API_BASE}/audit/public/${distId}`);
    check('GET /audit/public/:id → 200 (sin auth)', r.status === 200, `status=${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
    check('audit public tiene distribution_id', r.data.distribution_id === distId);
    check('audit public tiene item_id', !!r.data.item_id);
    check('audit public tiene quantity', typeof r.data.quantity === 'number');
    check('audit public tiene status=anchored', r.data.status === 'anchored', `got=${r.data.status}`);
    check('audit public NO expone receiver_identifier', !('receiver_identifier' in r.data), 'expuso PII');
    check('audit public tiene recipient_commitment', !!r.data.integrity?.recipient_commitment);
    check('audit public tiene signature_hash', !!r.data.integrity?.signature_hash);
    check('audit public tiene receipt_hash', !!r.data.integrity?.receipt_hash);
    check('audit public tiene blockchain.tx_id', !!r.data.blockchain?.tx_id);
    check('audit public tiene blockchain.hash', !!r.data.blockchain?.hash);
    check('audit public tiene center.name', !!r.data.center?.name, `got=${r.data.center?.name}`);
    check('audit public tiene pii_exposed=false', r.data.pii_exposed === false);
    check('audit public blockchain.record presente (on-chain)', !!r.data.blockchain?.record, 'sin record on-chain');

    const pubSigHash = r.data.integrity?.signature_hash;
    const pubReceiptHash = r.data.integrity?.receipt_hash;

    // Public audit distribución inexistente → 404
    r = await req(`${API_BASE}/audit/public/999999`);
    check('audit public id inexistente → 404', r.status === 404, `status=${r.status}`);

    // Internal audit — con token
    r = await req(`${API_BASE}/audit/internal/${distId}?purpose=api_test&external_reference=TEST-001`, { token: adminToken });
    check('GET /audit/internal/:id → 200', r.status === 200, `status=${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
    check('internal audit tiene distribution', !!r.data.distribution?.id);
    check('internal audit tiene verification object', !!r.data.verification);
    check('recipient_commitment_matches=true', r.data.verification?.recipient_commitment_matches === true, `got=${r.data.verification?.recipient_commitment_matches}`);
    check('signature_hash_matches=true', r.data.verification?.signature_hash_matches === true, `got=${r.data.verification?.signature_hash_matches}`);
    check('receipt_hash_matches=true', r.data.verification?.receipt_hash_matches === true, `got=${r.data.verification?.receipt_hash_matches}`);
    check('blockchain_hashes_match=true', r.data.verification?.blockchain_hashes_match === true, `got=${r.data.verification?.blockchain_hashes_match}`);
    check('internal audit tiene external_registry_step', !!r.data.external_registry_step);

    // Internal audit sin token → 401
    r = await req(`${API_BASE}/audit/internal/${distId}`);
    check('audit internal sin token → 401', r.status === 401, `status=${r.status}`);

    // Verificar audit_access_log — el internal audit debe haber registrado con purpose
    // (verificamos indirectamente haciendo otro audit interno y viendo que no rompe)
    r = await req(`${API_BASE}/audit/internal/${distId}?purpose=second_check`, { token: adminToken });
    check('Segundo audit internal OK', r.status === 200, `status=${r.status}`);
  }

  // ══════════════════════════════════════════════════════════════
  // DASHBOARD
  // ══════════════════════════════════════════════════════════════
  section('DASHBOARD');

  r = await req(`${API_BASE}/dashboard/summary`, { token: adminToken });
  check('GET /dashboard/summary → 200', r.status === 200, `status=${r.status}`);
  check('dashboard tiene summary.totalDonations', typeof r.data.summary?.totalDonations === 'number', `got=${r.data.summary?.totalDonations}`);
  check('dashboard tiene summary.totalDistributions', typeof r.data.summary?.totalDistributions === 'number', `got=${r.data.summary?.totalDistributions}`);
  check('dashboard tiene summary.activeCategories', typeof r.data.summary?.activeCategories === 'number', `got=${r.data.summary?.activeCategories}`);
  check('dashboard tiene summary.totalItemsInStock', typeof r.data.summary?.totalItemsInStock === 'number', `got=${r.data.summary?.totalItemsInStock}`);
  check('dashboard tiene recentDonations', Array.isArray(r.data.recentDonations));
  check('dashboard tiene recentDistributions', Array.isArray(r.data.recentDistributions));
  check('dashboard tiene stockByCategory', Array.isArray(r.data.stockByCategory));
  check('dashboard tiene weeklyDonations', Array.isArray(r.data.weeklyDonations));

  // Sin token → 401
  r = await req(`${API_BASE}/dashboard/summary`);
  check('GET /dashboard/summary sin token → 401', r.status === 401, `status=${r.status}`);

  // ══════════════════════════════════════════════════════════════
  // EDGE CASES / ROBUSTEZ
  // ══════════════════════════════════════════════════════════════
  section('ROBUSTEZ');

  // Endpoint inexistente → 404
  r = await req(`${API_BASE}/no-existe`, { token: adminToken });
  check('Ruta inexistente → 404', r.status === 404, `status=${r.status}`);

  // Distribución con stock insuficiente → 400
  r = await req(`${API_BASE}/items?limit=50`, { token: adminToken });
  const itemConStock2 = r.data.data.find((i) => i.quantity > 0);
  if (itemConStock2) {
    r = await req(`${API_BASE}/distributions/prepare`, {
      method: 'POST', token: adminToken,
      body: { item_id: itemConStock2.id, quantity: 99999, center_name: 'X', center_latitude: 0, center_longitude: 0 },
    });
    check('prepare con quantity > stock → 400', r.status === 400, `status=${r.status} ${JSON.stringify(r.data)}`);
  }

  // Item inexistente en prepare → 404
  r = await req(`${API_BASE}/distributions/prepare`, {
    method: 'POST', token: adminToken,
    body: { item_id: 999999, quantity: 1, center_name: 'X', center_latitude: 0, center_longitude: 0 },
  });
  check('prepare con item_id inexistente → 404', r.status === 404, `status=${r.status}`);

  // DNI demasiado corto → 400
  if (itemConStock) {
    const rPrep = await req(`${API_BASE}/distributions/prepare`, {
      method: 'POST', token: adminToken,
      body: { item_id: itemConStock.id, quantity: 1, center_name: 'X', center_latitude: 0, center_longitude: 0 },
    });
    if (rPrep.ok) {
      r = await req(`${API_BASE}/distributions/${rPrep.data.id}/identify-manual`, {
        method: 'POST', token: adminToken,
        body: { receiver_identifier: '123', doc_type: 'DNI' },
      });
      check('identify con DNI muy corto → 400', r.status === 400, `status=${r.status}`);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // RESULTADO FINAL
  // ══════════════════════════════════════════════════════════════
  const total = passed + failed;
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`RESULTADO: ${passed}/${total} tests pasaron`);
  if (failed > 0) {
    console.log(`\n❌ FALLARON ${failed} tests:`);
    failures.forEach((f) => console.log(`   • ${f.name}${f.detail ? `: ${f.detail}` : ''}`));
    process.exitCode = 1;
  } else {
    console.log(`\n✅ TODOS LOS TESTS PASARON`);
  }
  console.log('═'.repeat(50));
})();
