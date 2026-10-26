/**
 * Prueba de punta a punta contra la API en ejecución.
 *
 * Recorre el flujo completo (centros → donaciones → estados → transferencia → envíos →
 * recepción con QR → trazabilidad) y los controles de errores (stock, estados, borrados con
 * dependencias, permisos). Con --blockchain además exige que cada operación quede anclada en
 * Stellar y que el saldo on-chain coincida con el stock.
 *
 *   npm run test:e2e                                       # API en http://localhost:3012
 *   E2E_API_URL=http://localhost:3020 npm run test:e2e -- --blockchain
 *
 * Usa el seeder demo (admin / admin123, maria.gomez@acciondelsur.org / volante123).
 * Los datos que crea llevan el prefijo [E2E] y quedan en la base.
 */
const API = (process.env.E2E_API_URL || 'http://localhost:3012').replace(/\/$/, '') + '/api';
const BLOCKCHAIN = process.argv.includes('--blockchain');

let token = null;
let fallos = 0;
let pasos = 0;

async function call(method, path, body, auth = token) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch { /* respuesta no JSON (CSV) */ }
  return { status: res.status, data, headers: res.headers };
}

function check(nombre, ok, detalle) {
  pasos += 1;
  if (ok) {
    console.log(`  ✔ ${nombre}`);
  } else {
    fallos += 1;
    console.log(`  ✘ ${nombre}${detalle !== undefined ? `\n      ${JSON.stringify(detalle).slice(0, 400)}` : ''}`);
  }
  return ok;
}

const anclado = (estado) => (BLOCKCHAIN ? estado === 'anchored' : true);
const stockDe = async (id) => (await call('GET', `/items/${id}`)).data.available_quantity;

async function main() {
  const sufijo = Date.now().toString(36);
  console.log(`API: ${API}${BLOCKCHAIN ? ' · modo blockchain' : ''}\n`);

  console.log('Sesión y permisos');
  check('health', (await call('GET', '/health')).status === 200);
  check('login con contraseña incorrecta → 401', (await call('POST', '/auth/login', { username: 'admin', password: 'x' })).status === 401);
  const login = await call('POST', '/auth/login', { username: 'admin', password: 'admin123' });
  if (!check('login admin', login.status === 200 && login.data.token, login.data)) return;
  token = login.data.token;
  check('GET /auth/me', (await call('GET', '/auth/me')).data.role === 'ADMINISTRADOR');
  const vol = await call('POST', '/auth/login', { email: 'maria.gomez@acciondelsur.org', password: 'volante123' });
  check('voluntario no accede a /users → 403', (await call('GET', '/users', null, vol.data.token)).status === 403);
  check('sin token → 401', (await call('GET', '/items', null, null)).status === 401);

  console.log('\nCentros');
  const centroA = await call('POST', '/centers', { name: `[E2E] Centro Norte ${sufijo}`, location: 'Mendoza', operational_status: 'Operativo' });
  const centroB = await call('POST', '/centers', { name: `[E2E] Centro Sur ${sufijo}`, location: 'San Rafael', operational_status: 'Operativo' });
  check('alta de dos centros', centroA.status === 201 && centroB.status === 201, [centroA.data, centroB.data]);
  check('contrato de centro desplegado', anclado(centroA.data.blockchain?.status) && anclado(centroB.data.blockchain?.status),
    [centroA.data.blockchain, centroB.data.blockchain]);
  const A = centroA.data.id;
  const B = centroB.data.id;

  console.log('\nDonaciones e inventario');
  const categoria = (await call('GET', '/categories')).data.data?.[0] || (await call('GET', '/categories')).data[0];
  const nombre = `[E2E] Frazadas ${sufijo}`;
  const d1 = await call('POST', '/donations', {
    category_id: categoria.id, quantity: 10, name: nombre, center_id: A,
    donor_email: `e2e-${sufijo}@example.org`, donor_name: '[E2E] Donante',
  });
  check('registrar donación (10)', d1.status === 201, d1.data);
  check('donación anclada (mint)', anclado(d1.data.blockchain?.status), d1.data.blockchain);
  const itemId = d1.data.item.id;
  const d2 = await call('POST', '/donations', { category_id: categoria.id, quantity: 5, name: nombre, center_id: A });
  check('segunda donación del mismo insumo (5)', d2.status === 201 && anclado(d2.data.blockchain?.status), d2.data);
  check('stock acumulado = 15', (await stockDe(itemId)) === 15);

  const envioRecibido = await call('POST', '/shipments', { reception_center_id: B, details: [{ supply_id: itemId, quantity_sent: 1 }] });
  check('envío de insumo RECIBIDO → 409', envioRecibido.status === 409, envioRecibido.data);
  check('cambiar estado a DISPONIBLE', (await call('PATCH', `/items/${itemId}/status`, { status: 'DISPONIBLE' })).status === 200);
  const sinStock = await call('POST', '/shipments', { reception_center_id: B, details: [{ supply_id: itemId, quantity_sent: 100 }] });
  check('envío sin stock suficiente → 409 con detalle', sinStock.status === 409 && sinStock.data.available === 15, sinStock.data);

  console.log('\nTransferencia entre centros');
  const tr = await call('POST', '/transfers', { item_id: itemId, from_center_id: A, to_center_id: B, quantity: 15, reason: '[E2E] Redistribución' });
  check('transferir 15 de Norte a Sur', tr.status === 201, tr.data);
  check('transferencia anclada (transfer)', anclado(tr.data.status), tr.data.status);

  console.log('\nEnvíos');
  const e1 = await call('POST', '/shipments', { reception_center_id: B, confirm: true, details: [{ supply_id: itemId, quantity_sent: 4 }] });
  check('envío confirmado en el alta (4)', e1.status === 201 && e1.data.confirmed === true, e1.data);
  check('envío anclado (burn)', anclado(e1.data.blockchain_status), e1.data.blockchain_status);
  const e2 = await call('POST', '/shipments', { reception_center_id: B, details: [{ supply_id: itemId, quantity_sent: 2 }] });
  check('envío pendiente no descuenta stock', e2.status === 201 && (await stockDe(itemId)) === 11);
  const conf = await call('POST', `/shipments/${e2.data.id}/confirm`);
  check('confirmar envío pendiente (2)', conf.status === 200 && anclado(conf.data.blockchain_status), conf.data);
  check('doble confirmación → 409', (await call('POST', `/shipments/${e2.data.id}/confirm`)).status === 409);
  check('borrar envío confirmado → 409', (await call('DELETE', `/shipments/${e2.data.id}`)).status === 409);
  const e3 = await call('POST', '/shipments', { reception_center_id: B, details: [{ supply_id: itemId, quantity_sent: 1 }] });
  check('borrar envío pendiente', (await call('DELETE', `/shipments/${e3.data.id}`)).status === 200);
  check('stock tras envíos = 9', (await stockDe(itemId)) === 9);

  console.log('\nRecepción con QR');
  const rec = await call('POST', '/donation-receptions', { donor_email: `e2e-${sufijo}@example.org`, reception_center_id: B });
  check('crear recepción (QR)', rec.status === 201 && rec.data.public_token_qr, rec.data);
  const fin = await call('POST', `/donation-receptions/${rec.data.id}/finalize`, {
    details: [{ item_id: itemId, quantity_received: 4, quantity_accepted: 3, quantity_rejected: 1, rejection_reason_item: 'Dañado' }],
  });
  check('finalizar recepción (3 aceptados, 1 rechazado)', fin.status === 200 && fin.data.status === 'partially_rejected', fin.data);
  check('recepción anclada', !BLOCKCHAIN || Boolean(fin.data.blockchain_tx), fin.data);
  const pub = await call('GET', `/donation-receptions/public/${rec.data.public_token_qr}`, null, null);
  check('vista pública del donante', pub.status === 200 && pub.data.accepted_tracking.accepted_total === 3, pub.data);
  if (BLOCKCHAIN) {
    const ver = await call('GET', `/donation-receptions/public/${rec.data.public_token_qr}/verify`, null, null);
    check('verificación pública del anclaje', ver.data.verified === true, ver.data);
  }
  check('stock tras recepción = 12', (await stockDe(itemId)) === 12);

  console.log('\nTrazabilidad');
  const traza = await call('GET', `/items/${itemId}/trazabilidad`);
  const tipos = (traza.data.eventos || []).map((e) => e.tipo);
  check('línea de tiempo completa', traza.status === 200
    && ['donacion', 'transferencia', 'envio', 'recepcion'].every((t) => tipos.includes(t)), traza.data);
  if (BLOCKCHAIN) {
    const v = traza.data.verificacion || {};
    check('saldo on-chain = stock en la base (12)', v.disponible && v.coincide && v.saldo_onchain === 12, v);
    check('todas las operaciones con tx', traza.data.eventos.every((e) => e.tx), traza.data.eventos);
  }

  console.log('\nOtros');
  check('panel de apoyo', (await call('GET', '/support-panel')).status === 200);
  check('dashboard', (await call('GET', '/dashboard/summary')).status === 200);
  const csv = await call('GET', '/items/export/csv');
  check('exportar CSV', csv.status === 200 && String(csv.headers.get('content-type')).includes('csv'));
  const borrar = await call('DELETE', `/centers/${B}`);
  check('borrar centro con dependencias → 409', borrar.status === 409, borrar.data);
}

main()
  .catch((e) => { fallos += 1; console.error(`\nError inesperado: ${e.stack || e.message}`); })
  .finally(() => {
    console.log(`\n${pasos - fallos}/${pasos} verificaciones OK${fallos ? ` · ${fallos} FALLARON` : ''}`);
    process.exitCode = fallos ? 1 : 0;
  });
