require('dotenv').config();
const { sequelize, User, Category, CategoryAttribute } = require('../models');

const seedData = async () => {
  console.log('[Seeder] Conectando a la base de datos...');
  await sequelize.authenticate();
  console.log('[Seeder] Sincronizando modelos (force: false)...');
  await sequelize.sync({ force: false });

  // Admin user
  const adminExists = await User.findOne({ where: { username: 'admin' } });
  if (!adminExists) {
    const password_hash = await User.hashPassword('admin123');
    await User.create({
      username: 'admin',
      email: 'admin@acciondelsur.org',
      password_hash,
      role: 'admin',
    });
    console.log('[Seeder] Usuario admin creado.');
  } else {
    console.log('[Seeder] Usuario admin ya existe, omitiendo.');
  }

  // Categories and attributes
  const categories = [
    {
      name: 'Prendas',
      description: 'Ropa y accesorios de vestimenta',
      attributes: [
        { attribute_name: 'Tipo de prenda', attribute_type: 'select', options: ['Remera', 'Pantalón', 'Buzo', 'Campera', 'Ropa Interior', 'Medias', 'Otro'], is_required: true, display_order: 1 },
        { attribute_name: 'Género', attribute_type: 'select', options: ['Hombre', 'Mujer', 'Unisex', 'Niño', 'Niña'], is_required: true, display_order: 2 },
        { attribute_name: 'Talle', attribute_type: 'select', options: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '2', '4', '6', '8', '10', '12', '14', '16'], is_required: true, display_order: 3 },
        { attribute_name: 'Estado', attribute_type: 'select', options: ['Nuevo', 'Buen estado', 'Usado'], is_required: true, display_order: 4 },
      ],
    },
    {
      name: 'Alimentos',
      description: 'Productos alimenticios',
      attributes: [
        { attribute_name: 'Tipo', attribute_type: 'select', options: ['No Perecedero', 'Perecedero', 'Enlatado', 'Seco', 'Otro'], is_required: true, display_order: 1 },
        { attribute_name: 'Fecha de vencimiento', attribute_type: 'date', is_required: true, display_order: 2 },
        { attribute_name: 'Descripción', attribute_type: 'text', is_required: false, display_order: 3 },
      ],
    },
    {
      name: 'Bebidas',
      description: 'Líquidos para consumo',
      attributes: [
        { attribute_name: 'Tipo', attribute_type: 'select', options: ['Agua', 'Leche', 'Jugo', 'Otro'], is_required: true, display_order: 1 },
        { attribute_name: 'Volumen en litros', attribute_type: 'number', is_required: true, display_order: 2 },
        { attribute_name: 'Fecha de vencimiento', attribute_type: 'date', is_required: true, display_order: 3 },
      ],
    },
    {
      name: 'Productos de Limpieza',
      description: 'Artículos de higiene y limpieza',
      attributes: [
        { attribute_name: 'Tipo', attribute_type: 'select', options: ['Detergente', 'Lavandina', 'Jabón', 'Desinfectante', 'Otro'], is_required: true, display_order: 1 },
        { attribute_name: 'Volumen/Peso', attribute_type: 'text', is_required: false, display_order: 2 },
      ],
    },
    {
      name: 'Medicamentos',
      description: 'Productos farmacéuticos y primeros auxilios',
      attributes: [
        { attribute_name: 'Tipo', attribute_type: 'select', options: ['Analgésico', 'Antibiótico', 'Antiinflamatorio', 'Venda/Gasa', 'Antiséptico', 'Otro'], is_required: true, display_order: 1 },
        { attribute_name: 'Fecha de vencimiento', attribute_type: 'date', is_required: true, display_order: 2 },
        { attribute_name: 'Requiere receta', attribute_type: 'select', options: ['Sí', 'No'], is_required: true, display_order: 3 },
      ],
    },
    {
      name: 'Herramientas',
      description: 'Equipamiento y herramientas',
      attributes: [
        { attribute_name: 'Tipo', attribute_type: 'select', options: ['Manual', 'Eléctrica', 'Seguridad', 'Comunicación', 'Iluminación', 'Otro'], is_required: true, display_order: 1 },
        { attribute_name: 'Uso destinado', attribute_type: 'select', options: ['Bomberos', 'Rescate', 'Construcción', 'General'], is_required: true, display_order: 2 },
        { attribute_name: 'Estado', attribute_type: 'select', options: ['Nuevo', 'Funcional', 'Requiere reparación'], is_required: true, display_order: 3 },
      ],
    },
  ];

  for (const catData of categories) {
    const { attributes, ...catFields } = catData;
    let category = await Category.findOne({ where: { name: catFields.name } });

    if (!category) {
      category = await Category.create(catFields);
      console.log(`[Seeder] Categoría "${catFields.name}" creada.`);
    } else {
      console.log(`[Seeder] Categoría "${catFields.name}" ya existe, omitiendo.`);
    }

    const existingAttrs = await CategoryAttribute.count({ where: { category_id: category.id } });
    if (existingAttrs === 0 && attributes) {
      await CategoryAttribute.bulkCreate(
        attributes.map((a) => ({ ...a, category_id: category.id }))
      );
      console.log(`[Seeder]   → ${attributes.length} atributos creados para "${catFields.name}".`);
    }
  }

  console.log('[Seeder] ¡Listo! Base de datos inicializada.');
  process.exit(0);
};

seedData().catch((err) => {
  console.error('[Seeder] Error:', err);
  process.exit(1);
});
