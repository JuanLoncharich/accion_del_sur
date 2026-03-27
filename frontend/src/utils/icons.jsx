import {
  Beef,
  Package,
  Pill,
  Shirt,
  SprayCan,
  CupSoda,
  Wrench,
} from 'lucide-react';

const CATEGORY_ICONS = {
  Prendas: Shirt,
  Alimentos: Beef,
  Bebidas: CupSoda,
  'Productos de Limpieza': SprayCan,
  Medicamentos: Pill,
  Herramientas: Wrench,
};

export const getCategoryIcon = (categoryName) => CATEGORY_ICONS[categoryName] || Package;
