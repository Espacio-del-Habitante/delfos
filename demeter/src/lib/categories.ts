/** Categorías de mercado — keywords locales, cero tokens. */

export const CATEGORIES = [
  { id: 'proteina', label: 'Proteína', emoji: '🥩' },
  { id: 'lacteos', label: 'Lácteos', emoji: '🥛' },
  { id: 'verduras', label: 'Verduras', emoji: '🥬' },
  { id: 'frutas', label: 'Frutas', emoji: '🍎' },
  { id: 'harinas', label: 'Harinas', emoji: '🍞' },
  { id: 'granos', label: 'Granos', emoji: '🫘' },
  { id: 'aseo', label: 'Aseo', emoji: '🧼' },
  { id: 'bebidas', label: 'Bebidas', emoji: '🧃' },
  { id: 'snacks', label: 'Snacks', emoji: '🍿' },
  { id: 'otros', label: 'Otros', emoji: '🧺' },
] as const;

const RULES: { id: string; words: string[] }[] = [
  { id: 'proteina', words: ['carne', 'res', 'pollo', 'pechuga', 'cerdo', 'pescado', 'atun', 'atún', 'huevo', 'huevos', 'jamon', 'jamón', 'salchicha', 'chorizo', 'mortadela'] },
  { id: 'lacteos', words: ['leche', 'yogurt', 'yogur', 'queso', 'mantequilla', 'crema', 'kumis'] },
  { id: 'verduras', words: ['papa', 'papas', 'yuca', 'zanahoria', 'tomate', 'cebolla', 'ajo', 'lechuga', 'brocoli', 'brócoli', 'pimenton', 'pimentón', 'platano', 'plátano', 'verdura', 'verduras', 'cilantro', 'apio'] },
  { id: 'frutas', words: ['banano', 'banana', 'manzana', 'naranja', 'limon', 'limón', 'fresa', 'mango', 'uva', 'pera', 'papaya', 'fruta', 'frutas', 'aguacate'] },
  { id: 'harinas', words: ['pan', 'arepa', 'harina', 'pasta', 'espagueti', 'spaguetti', 'galleta', 'galletas', 'tostada', 'croissant', 'wrap'] },
  { id: 'granos', words: ['arroz', 'frijol', 'frijoles', 'fríjol', 'lenteja', 'lentejas', 'avena', 'quinua', 'quinoa', 'maiz', 'maíz'] },
  { id: 'aseo', words: ['jabon', 'jabón', 'shampoo', 'champú', 'detergente', 'cloro', 'papel higienico', 'papel higiénico', 'servilleta', 'esponja', 'limpia'] },
  { id: 'bebidas', words: ['agua', 'jugo', 'gaseosa', 'cerveza', 'vino', 'cafe', 'café', 'te', 'té', 'gatorade', 'soda'] },
  { id: 'snacks', words: ['papitas', 'doritos', 'chocolate', 'dulce', 'dulces', 'helado', 'chips', 'mecato'] },
];

export function categorizeProduct(name = '') {
  const n = String(name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  for (const rule of RULES) {
    for (const w of rule.words) {
      const ww = w.normalize('NFD').replace(/\p{M}/gu, '');
      if (n.includes(ww)) return rule.id;
    }
  }
  return 'otros';
}

export function categoryMeta(id: string) {
  return CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
}
