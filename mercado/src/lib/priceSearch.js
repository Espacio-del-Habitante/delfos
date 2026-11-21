/** Enlaces de comparación de precios (cero tokens, abre el buscador externo). */

export function priceSearchLinks(productName, { city = 'Colombia' } = {}) {
  const q = String(productName || '').trim();
  if (!q) return [];
  const enc = encodeURIComponent(q);
  const encGeo = encodeURIComponent(`${q} ${city}`);
  return [
    {
      id: 'ml',
      label: 'Mercado Libre',
      hint: 'Precios en tiendas y usados',
      url: `https://listado.mercadolibre.com.co/${enc}`,
    },
    {
      id: 'google',
      label: 'Google Shopping',
      hint: 'Comparar ofertas',
      url: `https://www.google.com/search?tbm=shop&hl=es-419&gl=co&q=${encGeo}`,
    },
    {
      id: 'exito',
      label: 'Éxito',
      hint: 'Supermercado',
      url: `https://www.exito.com/s?q=${enc}`,
    },
  ];
}
