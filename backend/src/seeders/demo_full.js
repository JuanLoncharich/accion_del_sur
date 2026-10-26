'use strict';

/**
 * Seeder de DEMO (esquema viejo / 27-03) — carga abundante para mostrar la app.
 *   node src/seeders/demo_full.js
 * Limpia las tablas de contenido (no toca users ni categories/atributos) y repuebla.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const {
  sequelize, User, Category, Item, Center,
  Donation, Distribution, TokenTransfer,
  DonationReception, DonationReceptionDetail,
} = require('../models');

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const hace = (dias) => { const d = new Date(); d.setDate(d.getDate() - dias); return d; };
const hash = (n = 64) => Array.from({ length: n }, () => '0123456789abcdef'[randInt(0, 15)]).join('');
const txId = () => hash(56).toUpperCase();

const CENTROS = [
  { name: 'Centro Norte - Bahía Blanca', latitude: -38.7183, longitude: -62.2663 },
  { name: 'Depósito Central - Neuquén', latitude: -38.9516, longitude: -68.0591 },
  { name: 'Punto Sur - Comodoro Rivadavia', latitude: -45.8641, longitude: -67.4966 },
  { name: 'Centro Comunitario - Bariloche', latitude: -41.1335, longitude: -71.3103 },
];

// Insumos por nombre de categoría, con attributes acordes
const ITEMS_POR_CATEGORIA = {
  Prendas: [
    ['Camperas de abrigo', { 'Tipo de prenda': 'Campera', 'Género': 'Unisex', 'Talle': 'L', 'Estado': 'Buen estado' }],
    ['Buzos de polar', { 'Tipo de prenda': 'Buzo', 'Género': 'Unisex', 'Talle': 'M', 'Estado': 'Nuevo' }],
    ['Remeras de algodón', { 'Tipo de prenda': 'Remera', 'Género': 'Hombre', 'Talle': 'M', 'Estado': 'Nuevo' }],
    ['Pantalones de gabardina', { 'Tipo de prenda': 'Pantalón', 'Género': 'Mujer', 'Talle': 'S', 'Estado': 'Usado' }],
    ['Medias de lana', { 'Tipo de prenda': 'Medias', 'Género': 'Unisex', 'Talle': 'M', 'Estado': 'Nuevo' }],
  ],
  Alimentos: [
    ['Arroz largo fino 1kg', { Tipo: 'No Perecedero', Descripción: 'Bolsa cerrada' }],
    ['Fideos secos 500g', { Tipo: 'Seco', Descripción: 'Guiseros' }],
    ['Leche en polvo 800g', { Tipo: 'No Perecedero' }],
    ['Yerba mate 1kg', { Tipo: 'Seco' }],
    ['Conservas de atún', { Tipo: 'Enlatado' }],
  ],
  Bebidas: [
    ['Agua mineral 2L', { Tipo: 'Agua', 'Volumen en litros': 2 }],
    ['Leche larga vida 1L', { Tipo: 'Leche', 'Volumen en litros': 1 }],
    ['Jugo en polvo (caja)', { Tipo: 'Jugo', 'Volumen en litros': 1 }],
  ],
  'Productos de Limpieza': [
    ['Lavandina 2L', { Tipo: 'Lavandina', 'Volumen/Peso': '2L' }],
    ['Jabón blanco en pan', { Tipo: 'Jabón', 'Volumen/Peso': '200g' }],
    ['Detergente 750ml', { Tipo: 'Detergente', 'Volumen/Peso': '750ml' }],
  ],
  Medicamentos: [
    ['Paracetamol 500mg', { Tipo: 'Analgésico', 'Requiere receta': 'No' }],
    ['Ibuprofeno 400mg', { Tipo: 'Antiinflamatorio', 'Requiere receta': 'No' }],
    ['Vendas elásticas', { Tipo: 'Venda/Gasa', 'Requiere receta': 'No' }],
    ['Alcohol en gel 500ml', { Tipo: 'Antiséptico', 'Requiere receta': 'No' }],
  ],
  Herramientas: [
    ['Linternas LED', { Tipo: 'Iluminación', 'Uso destinado': 'Rescate', Estado: 'Nuevo' }],
    ['Guantes de trabajo', { Tipo: 'Seguridad', 'Uso destinado': 'General', Estado: 'Nuevo' }],
    ['Palas de mano', { Tipo: 'Manual', 'Uso destinado': 'Construcción', Estado: 'Funcional' }],
  ],
};

const DONANTES = [
  'carlos.martinez@gmail.com', 'contacto@esperanzasur.org.ar', 'lucia.benitez@gmail.com',
  'coop@patagoniasolidaria.org.ar', 'diego.fuentes@hotmail.com', 'donaciones@superaustral.com.ar',
  'maria.rojas@yahoo.com.ar', 'roberto.alvarez@gmail.com',
];
const RECEPTORES = [
  'Comedor Los Pinos', 'Merendero San Cayetano', 'Familia González (Barrio Norte)',
  'Refugio Municipal', 'Escuela N° 12', 'Parroquia del Carmen', 'Vecinos de Villa Sur',
];

const seed = async () => {
  await sequelize.authenticate();
  await sequelize.sync();
  console.log('[Seeder] Conectado. Limpiando tablas de contenido...');

  const t = await sequelize.transaction();
  try {
    // Limpiar contenido (no users/categories/attributes)
    for (const M of [DonationReceptionDetail, DonationReception, TokenTransfer, Distribution, Donation, Item, Center]) {
      await M.destroy({ where: {}, transaction: t });
    }

    // Usuarios
    const [admin] = await User.findOrCreate({
      where: { username: 'admin' },
      defaults: { username: 'admin', email: 'admin@acciondelsur.org', password_hash: await User.hashPassword('admin123'), role: 'admin' },
      transaction: t,
    });
    const [operador] = await User.findOrCreate({
      where: { username: 'logistica' },
      defaults: { username: 'logistica', email: 'logistica@acciondelsur.org', password_hash: await User.hashPassword('logistica123'), role: 'logistica' },
      transaction: t,
    });
    const usuarios = [admin, operador];
    console.log('[Seeder] Usuarios asegurados (admin / logistica).');

    // Centros
    const centros = await Center.bulkCreate(
      CENTROS.map((c, i) => ({
        ...c, geo_hash: hash(12), is_active: i !== 2, created_by: admin.id,
        blockchain_contract_id: `C${hash(20).toUpperCase()}`,
      })),
      { transaction: t },
    );
    console.log(`[Seeder] ${centros.length} centros creados.`);

    // Categorías existentes
    const categorias = await Category.findAll({ transaction: t });
    const catByName = Object.fromEntries(categorias.map((c) => [c.name, c]));

    // Items
    const itemsData = [];
    for (const [catName, lista] of Object.entries(ITEMS_POR_CATEGORIA)) {
      const cat = catByName[catName];
      if (!cat) continue;
      for (const [name, attrs] of lista) {
        itemsData.push({
          category_id: cat.id, name, quantity: randInt(25, 400), attributes: attrs,
          token_status: 'minted', blockchain_hash: hash(), blockchain_tx_id: txId(),
          current_center_id: pick(centros).id, is_active: true,
        });
      }
    }
    const items = await Item.bulkCreate(itemsData, { transaction: t });
    console.log(`[Seeder] ${items.length} insumos creados.`);

    // Donaciones
    const donacionesData = [];
    for (let i = 0; i < 18; i += 1) {
      const item = pick(items);
      const centro = centros.find((c) => c.id === item.current_center_id) || pick(centros);
      donacionesData.push({
        item_id: item.id, quantity: randInt(5, 80), center_id: centro.id,
        center_name: centro.name, center_latitude: centro.latitude, center_longitude: centro.longitude,
        donor_email: pick(DONANTES), status: 'anchored', registered_by: pick(usuarios).id,
        blockchain_hash: hash(), blockchain_tx_id: txId(),
        notes: 'Donación registrada en la jornada solidaria.', createdAt: hace(randInt(1, 85)),
      });
    }
    const donaciones = await Donation.bulkCreate(donacionesData, { transaction: t });
    console.log(`[Seeder] ${donaciones.length} donaciones creadas.`);

    // Distribuciones
    const distData = [];
    for (let i = 0; i < 12; i += 1) {
      const item = pick(items);
      const centro = centros.find((c) => c.id === item.current_center_id) || pick(centros);
      distData.push({
        item_id: item.id, quantity: randInt(3, 40), receiver_identifier: pick(RECEPTORES),
        status: 'anchored', assurance_level: 'MANUAL_VERIFIED', identity_capture_method: 'manual',
        registered_by: pick(usuarios).id, center_name: centro.name,
        center_latitude: centro.latitude, center_longitude: centro.longitude,
        recipient_commitment: hash(), notes: 'Entrega verificada manualmente.', createdAt: hace(randInt(1, 60)),
      });
    }
    const distribuciones = await Distribution.bulkCreate(distData, { transaction: t });
    console.log(`[Seeder] ${distribuciones.length} distribuciones creadas.`);

    // Transferencias entre centros
    const transData = [];
    for (let i = 0; i < 6; i += 1) {
      const item = pick(items);
      let from = pick(centros); let to = pick(centros);
      while (to.id === from.id) to = pick(centros);
      transData.push({
        item_id: item.id, from_center_id: from.id, to_center_id: to.id, quantity: randInt(2, 30),
        reason: 'Reabastecimiento entre centros', status: 'anchored', transferred_by: admin.id,
        egreso_blockchain_hash: hash(), egreso_blockchain_tx: txId(),
        ingreso_blockchain_hash: hash(), ingreso_blockchain_tx: txId(),
      });
    }
    const transferencias = await TokenTransfer.bulkCreate(transData, { transaction: t });
    console.log(`[Seeder] ${transferencias.length} transferencias creadas.`);

    // Recepciones de donación (con detalles)
    let totalDetalles = 0;
    for (let i = 0; i < 6; i += 1) {
      const email = pick(DONANTES);
      const recepcion = await DonationReception.create({
        public_token_qr: hash(40), donor_email: email, donor_email_salt: hash(32),
        donor_email_hash: hash(), status: pick(['completed', 'completed', 'partially_rejected']),
        anchored_tx_id: txId(), anchored_hash: hash(), created_by: pick(usuarios).id,
        finalized_by: admin.id, finalized_at: hace(randInt(1, 40)), createdAt: hace(randInt(2, 45)),
      }, { transaction: t });

      const nItems = randInt(1, 3);
      const usados = new Set();
      for (let j = 0; j < nItems; j += 1) {
        let item = pick(items);
        while (usados.has(item.id)) item = pick(items);
        usados.add(item.id);
        const recibido = randInt(5, 50);
        const rechazado = Math.random() < 0.25 ? randInt(1, 4) : 0;
        await DonationReceptionDetail.create({
          reception_id: recepcion.id, item_id: item.id, quantity_received: recibido,
          quantity_accepted: recibido - rechazado, quantity_rejected: rechazado,
          rejection_reason_item: rechazado ? 'Producto vencido' : null,
        }, { transaction: t });
        totalDetalles += 1;
      }
    }
    console.log(`[Seeder] 6 recepciones creadas (${totalDetalles} detalles).`);

    await t.commit();
    console.log('[Seeder] Transacción confirmada.');
  } catch (e) {
    await t.rollback();
    throw e;
  }

  const resumen = {
    Usuarios: await User.count(), Categorías: await Category.count(), Insumos: await Item.count(),
    Centros: await Center.count(), Donaciones: await Donation.count(),
    Distribuciones: await Distribution.count(), Transferencias: await TokenTransfer.count(),
    Recepciones: await DonationReception.count(),
  };
  console.log('\n=============== RESUMEN ===============');
  Object.entries(resumen).forEach(([k, v]) => console.log(`  ${k.padEnd(16)} ${v}`));
  console.log('=======================================');
  console.log('Login:  admin / admin123   ·   logistica / logistica123');
};

seed()
  .then(async () => { await sequelize.close(); process.exit(0); })
  .catch(async (e) => { console.error('[Seeder] Error:', e); await sequelize.close().catch(() => {}); process.exit(1); });
