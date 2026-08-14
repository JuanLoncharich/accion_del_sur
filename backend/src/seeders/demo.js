'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const {
  sequelize,
  User,
  Donor,
  Donation,
  Category,
  Item,
  Center,
  Shipment,
  ShipmentDetail,
  DonationSupply,
} = require('../models');

const forceFlag = process.argv.includes('--force');

// Fecha (YYYY-MM-DD) de hace N días
const hace = (dias) => {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - dias);
  return fecha.toISOString().split('T')[0];
};

const limpiarDatos = async (transaction) => {
  console.log('[Seeder] Eliminando datos existentes (modo --force)...');
  // Orden inverso a las dependencias. Los usuarios nunca se borran.
  await ShipmentDetail.destroy({ where: {}, transaction });
  await Shipment.destroy({ where: {}, transaction });
  await DonationSupply.destroy({ where: {}, transaction });
  await Donation.destroy({ where: {}, transaction });
  await Item.destroy({ where: {}, transaction });
  await Category.destroy({ where: { parent_category_id: { [sequelize.Sequelize.Op.ne]: null } }, transaction });
  await Category.destroy({ where: {}, transaction });
  await Center.destroy({ where: {}, transaction });
  await Donor.destroy({ where: {}, transaction });
};

const seed = async () => {
  await sequelize.authenticate();
  console.log('[Seeder] Conexión a la base de datos establecida.');
  await sequelize.sync();

  const donacionesExistentes = await Donation.count();
  if (donacionesExistentes > 0 && !forceFlag) {
    console.log(`[Seeder] Ya existen ${donacionesExistentes} donaciones. No se insertan datos duplicados.`);
    console.log('[Seeder] Usá "node src/seeders/demo.js --force" para regenerar los datos de demo.');
    return;
  }

  const t = await sequelize.transaction();
  try {
    if (forceFlag) await limpiarDatos(t);

    // ========== 1. USUARIOS ==========
    const usuariosData = [
      { email: 'admin@acciondelsur.org', password: 'admin123', role: 'ADMINISTRADOR' },
      { email: 'maria.gomez@acciondelsur.org', password: 'volante123', role: 'VOLUNTARIO' },
      { email: 'lucas.fernandez@acciondelsur.org', password: 'volante123', role: 'VOLUNTARIO' },
    ];
    const usuarios = [];
    for (const data of usuariosData) {
      const [usuario] = await User.findOrCreate({
        where: { email: data.email },
        defaults: data,
        transaction: t,
      });
      usuarios.push(usuario);
    }
    const [admin, maria, lucas] = usuarios;
    console.log('[Seeder] Usuarios: 3 asegurados (1 administrador, 2 voluntarios).');

    // ========== 2. CATEGORÍAS ==========
    const categoriasPadre = await Category.bulkCreate([
      { name: 'Alimentos' },
      { name: 'Ropa' },
      { name: 'Higiene y Limpieza' },
      { name: 'Medicamentos' },
      { name: 'Herramientas' },
    ], { transaction: t });

    const [catAlimentos, catRopa, catHigiene, catMedicamentos, catHerramientas] = categoriasPadre;

    const subcategorias = await Category.bulkCreate([
      { name: 'Alimentos no perecederos', parent_category_id: catAlimentos.id },
      { name: 'Bebidas', parent_category_id: catAlimentos.id },
      { name: 'Abrigo', parent_category_id: catRopa.id },
      { name: 'Calzado', parent_category_id: catRopa.id },
      { name: 'Primeros auxilios', parent_category_id: catMedicamentos.id },
      { name: 'Limpieza del hogar', parent_category_id: catHigiene.id },
    ], { transaction: t });

    const cat = {};
    [...categoriasPadre, ...subcategorias].forEach((c) => { cat[c.name] = c.id; });
    console.log(`[Seeder] ${categoriasPadre.length + subcategorias.length} categorías creadas (5 principales, 6 subcategorías).`);

    // ========== 3. INSUMOS ==========
    const insumos = await Item.bulkCreate([
      { name: 'Arroz largo fino 1kg', available_quantity: 250, category_id: cat['Alimentos no perecederos'] },
      { name: 'Fideos secos 500g', available_quantity: 300, category_id: cat['Alimentos no perecederos'] },
      { name: 'Leche en polvo 800g', available_quantity: 180, category_id: cat['Alimentos no perecederos'] },
      { name: 'Yerba mate 1kg', available_quantity: 120, category_id: cat['Alimentos no perecederos'] },
      { name: 'Aceite de girasol 900ml', available_quantity: 200, category_id: cat['Alimentos no perecederos'] },
      { name: 'Agua mineral 2L', available_quantity: 400, category_id: cat['Bebidas'] },
      { name: 'Frazadas de polar', available_quantity: 60, category_id: cat['Abrigo'] },
      { name: 'Camperas de abrigo', available_quantity: 75, category_id: cat['Abrigo'] },
      { name: 'Zapatillas deportivas', available_quantity: 90, category_id: cat['Calzado'] },
      { name: 'Jabón blanco en pan', available_quantity: 150, category_id: cat['Limpieza del hogar'] },
      { name: 'Lavandina 2L', available_quantity: 200, category_id: cat['Limpieza del hogar'] },
      { name: 'Alcohol en gel 500ml', available_quantity: 120, category_id: cat['Limpieza del hogar'] },
      { name: 'Paracetamol 500mg', available_quantity: 80, category_id: cat['Primeros auxilios'] },
      { name: 'Vendas elásticas', available_quantity: 50, category_id: cat['Primeros auxilios'] },
      { name: 'Linternas LED', available_quantity: 30, category_id: catHerramientas.id },
      { name: 'Guantes de trabajo', available_quantity: 100, category_id: catHerramientas.id },
      { name: 'Pañales para bebé', available_quantity: 160, category_id: cat['Higiene y Limpieza'] },
      { name: 'Toallas femeninas', available_quantity: 140, category_id: cat['Higiene y Limpieza'] },
    ], { transaction: t });
    console.log(`[Seeder] ${insumos.length} insumos creados.`);

    // ========== 4. CENTROS DE RECEPCIÓN ==========
    const centros = await Center.bulkCreate([
      {
        name: 'Centro Norte - Bahía Blanca',
        location: 'Zelarrayán 1400, Bahía Blanca, Buenos Aires',
        operational_status: 'Operativo',
        managed_by: maria.id,
      },
      {
        name: 'Depósito Central - Neuquén',
        location: 'Av. Argentina 1800, Neuquén Capital',
        operational_status: 'Operativo - Capacidad limitada',
        managed_by: admin.id,
      },
      {
        name: 'Punto Sur - Comodoro Rivadavia',
        location: 'Ruta Nacional 3 Km 1867, Comodoro Rivadavia, Chubut',
        operational_status: 'En mantenimiento',
        managed_by: lucas.id,
      },
      {
        name: 'Centro Comunitario - Bariloche',
        location: 'Elflein 450, San Carlos de Bariloche, Río Negro',
        operational_status: 'Operativo',
        managed_by: maria.id,
      },
    ], { transaction: t });
    console.log(`[Seeder] ${centros.length} centros de recepción creados.`);

    // ========== 5. DONANTES ==========
    const donantes = await Donor.bulkCreate([
      { name: 'Carlos Martínez', contact: 'carlos.martinez@gmail.com', city: 'Bahía Blanca', registered_by: maria.id },
      { name: 'Fundación Esperanza Sur', contact: 'contacto@esperanzasur.org.ar', city: 'Neuquén', registered_by: maria.id },
      { name: 'Lucía Benítez', contact: '+54 297 415-8823', city: 'Comodoro Rivadavia', registered_by: lucas.id },
      { name: 'Cooperativa Patagonia Solidaria', contact: 'coop@patagoniasolidaria.org.ar', city: 'San Carlos de Bariloche', registered_by: lucas.id },
      { name: 'Diego Fuentes', contact: 'diego.fuentes@hotmail.com', city: 'Trelew', registered_by: admin.id },
      { name: 'María Inés Rojas', contact: '+54 2920 46-1177', city: 'Viedma', registered_by: maria.id },
      { name: 'Supermercados Austral S.A.', contact: 'donaciones@superaustral.com.ar', city: 'Comodoro Rivadavia', registered_by: lucas.id },
      { name: 'Roberto Álvarez', contact: 'roberto.alvarez@gmail.com', city: 'Puerto Madryn', registered_by: admin.id },
    ], { transaction: t });
    console.log(`[Seeder] ${donantes.length} donantes creados.`);

    // ========== 6. DONACIONES ==========
    // [díasAtrás, índiceDonante, índiceUsuario, índicesDeInsumos]
    const planDonaciones = [
      [3, 0, 1, [0, 1, 5]],
      [8, 1, 0, [2, 3, 6, 7]],
      [13, 2, 2, [8, 9]],
      [19, 3, 1, [10, 11, 12]],
      [26, 4, 0, [13, 14, 15]],
      [33, 5, 2, [16, 17]],
      [41, 6, 1, [0, 4, 5, 6]],
      [48, 7, 0, [7, 8, 9]],
      [56, 0, 2, [10, 11]],
      [65, 2, 1, [1, 2, 12, 13]],
      [74, 4, 0, [14, 16]],
      [86, 6, 2, [3, 5, 17]],
    ];

    const donaciones = await Donation.bulkCreate(
      planDonaciones.map(([dias, iDonante, iUsuario]) => ({
        date: hace(dias),
        donor_id: donantes[iDonante].id,
        registered_by: usuarios[iUsuario].id,
      })),
      { transaction: t },
    );
    console.log(`[Seeder] ${donaciones.length} donaciones creadas (últimos 90 días).`);

    // ========== 7. VÍNCULOS DONACIÓN - INSUMO ==========
    const vinculos = [];
    planDonaciones.forEach(([, , , indicesInsumos], i) => {
      indicesInsumos.forEach((iInsumo) => {
        vinculos.push({ donation_id: donaciones[i].id, supply_id: insumos[iInsumo].id });
      });
    });
    await DonationSupply.bulkCreate(vinculos, { transaction: t });
    console.log(`[Seeder] ${vinculos.length} vínculos donación-insumo creados.`);

    // ========== 8. ENVÍOS ==========
    // [díasAtrás, índiceCentro, índiceUsuario, confirmado, [[índiceInsumo, cantidad], ...]]
    const planEnvios = [
      [2, 0, 1, false, [[0, 40], [1, 55], [5, 60]]],
      [7, 1, 0, true, [[2, 30], [6, 15]]],
      [15, 2, 2, false, [[9, 25], [10, 35], [11, 20]]],
      [24, 3, 1, true, [[13, 10], [14, 5], [15, 20]]],
      [38, 0, 0, true, [[16, 45], [17, 30]]],
      [52, 1, 2, false, [[3, 25], [4, 50]]],
    ];

    const envios = await Shipment.bulkCreate(
      planEnvios.map(([dias, iCentro, iUsuario, confirmado]) => ({
        date: hace(dias),
        reception_center_id: centros[iCentro].id,
        registered_by: usuarios[iUsuario].id,
        confirmed: confirmado,
      })),
      { transaction: t },
    );
    console.log(`[Seeder] ${envios.length} envíos creados (${planEnvios.filter((e) => e[3]).length} confirmados).`);

    const detalles = [];
    for (let i = 0; i < planEnvios.length; i += 1) {
      const [, , , confirmado, items] = planEnvios[i];
      for (const [iInsumo, cantidadPlanificada] of items) {
        const insumo = insumos[iInsumo];
        let cantidad = cantidadPlanificada;

        if (confirmado) {
          // El stock del insumo ya refleja la salida: nunca puede quedar negativo.
          cantidad = Math.max(1, Math.min(cantidad, insumo.available_quantity));
          insumo.available_quantity -= cantidad;
          await insumo.save({ transaction: t });
        }

        detalles.push({ shipment_id: envios[i].id, supply_id: insumo.id, quantity_sent: cantidad });
      }
    }
    await ShipmentDetail.bulkCreate(detalles, { transaction: t });
    console.log(`[Seeder] ${detalles.length} detalles de envío creados.`);

    await t.commit();
    console.log('[Seeder] Transacción confirmada.');
  } catch (error) {
    await t.rollback();
    throw error;
  }

  // ========== RESUMEN ==========
  const resumen = {
    Usuarios: await User.count(),
    Donantes: await Donor.count(),
    Donaciones: await Donation.count(),
    Categorías: await Category.count(),
    Insumos: await Item.count(),
    'Centros de recepción': await Center.count(),
    Envíos: await Shipment.count(),
    'Detalles de envío': await ShipmentDetail.count(),
    'Vínculos donación-insumo': await DonationSupply.count(),
  };

  console.log('\n=============== RESUMEN ===============');
  Object.entries(resumen).forEach(([clave, valor]) => {
    console.log(`  ${clave.padEnd(26)} ${valor}`);
  });
  console.log('=======================================');
  console.log('\nUsuarios de acceso:');
  console.log('  admin@acciondelsur.org           / admin123     (ADMINISTRADOR)');
  console.log('  maria.gomez@acciondelsur.org     / volante123   (VOLUNTARIO)');
  console.log('  lucas.fernandez@acciondelsur.org / volante123   (VOLUNTARIO)');
};

seed()
  .then(async () => {
    await sequelize.close();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('[Seeder] Error al poblar la base de datos:', error);
    await sequelize.close().catch(() => {});
    process.exit(1);
  });
