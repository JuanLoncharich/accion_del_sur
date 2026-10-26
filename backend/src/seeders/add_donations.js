'use strict';

/**
 * Agrega N donaciones (aditivo) al esquema viejo, reusando items/centros/usuarios existentes.
 *   node src/seeders/add_donations.js [N]     (default 300)
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { sequelize, User, Item, Center, Donation } = require('../models');

const N = parseInt(process.argv[2], 10) || 300;
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const hace = (dias) => { const d = new Date(); d.setDate(d.getDate() - dias); return d; };
const hash = (n = 64) => Array.from({ length: n }, () => '0123456789abcdef'[randInt(0, 15)]).join('');
const txId = () => hash(56).toUpperCase();

const DONANTES = [
  'carlos.martinez@gmail.com', 'contacto@esperanzasur.org.ar', 'lucia.benitez@gmail.com',
  'coop@patagoniasolidaria.org.ar', 'diego.fuentes@hotmail.com', 'donaciones@superaustral.com.ar',
  'maria.rojas@yahoo.com.ar', 'roberto.alvarez@gmail.com', 'ana.silva@gmail.com',
  'club.rotario@sur.org.ar', 'vecinos.solidarios@gmail.com', 'empresa.austral@corp.com.ar',
];

const seed = async () => {
  await sequelize.authenticate();
  const items = await Item.findAll();
  const centros = await Center.findAll();
  const usuarios = await User.findAll();
  if (!items.length || !centros.length || !usuarios.length) {
    throw new Error('Faltan items/centros/usuarios. Corré primero: node src/seeders/demo_full.js');
  }

  const antes = await Donation.count();
  const filas = [];
  for (let i = 0; i < N; i += 1) {
    const item = pick(items);
    const centro = centros.find((c) => c.id === item.current_center_id) || pick(centros);
    filas.push({
      item_id: item.id, quantity: randInt(3, 90), center_id: centro.id,
      center_name: centro.name, center_latitude: centro.latitude, center_longitude: centro.longitude,
      donor_email: pick(DONANTES), status: pick(['anchored', 'anchored', 'anchored', 'pending']),
      registered_by: pick(usuarios).id, blockchain_hash: hash(), blockchain_tx_id: txId(),
      notes: pick(['Donación de campaña.', 'Colecta barrial.', 'Aporte de empresa.', 'Jornada solidaria.']),
      createdAt: hace(randInt(0, 180)),
    });
  }

  // Insertar en lotes para no armar un INSERT gigante
  const LOTE = 100;
  for (let i = 0; i < filas.length; i += LOTE) {
    await Donation.bulkCreate(filas.slice(i, i + LOTE));
    process.stdout.write(`  insertadas ${Math.min(i + LOTE, filas.length)}/${filas.length}\r`);
  }
  const despues = await Donation.count();
  console.log(`\n[Seeder] Donaciones: ${antes} -> ${despues} (+${despues - antes}).`);
};

seed()
  .then(async () => { await sequelize.close(); process.exit(0); })
  .catch(async (e) => { console.error('[Seeder] Error:', e.message); await sequelize.close().catch(() => {}); process.exit(1); });
