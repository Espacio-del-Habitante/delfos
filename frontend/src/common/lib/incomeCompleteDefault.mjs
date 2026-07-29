/**
 * Default del toggle "ingreso completo del periodo".
 * `expectedIncome` = ingreso esperado **del periodo** (mensual / divisor); el caller lo escala.
 * on: Salario o monto ≈ esperado; off: claramente parcial.
 * ponytail: techo = umbrales fijos 0.7 / 0.85; upgrade = pedir confirmación explícita al usuario.
 */
export function guessIncomeIsComplete(category, amount, expectedIncome) {
  const n = Number(amount) || 0;
  const expected = Number(expectedIncome) || 0;
  if (expected > 0 && n < expected * 0.7) return false;
  const cat = (category || '').trim().toLowerCase();
  if (cat === 'salario' || cat.includes('salario')) return true;
  if (expected > 0 && n >= expected * 0.85) return true;
  if (expected > 0) return false;
  return true;
}
