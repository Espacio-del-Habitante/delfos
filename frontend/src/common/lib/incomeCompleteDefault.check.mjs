/** ponytail: node src/common/lib/incomeCompleteDefault.check.mjs
 * expectedIncome = del periodo (caller ya dividió mensual / N).
 */
import assert from 'node:assert/strict';
import { guessIncomeIsComplete } from './incomeCompleteDefault.mjs';

assert.equal(guessIncomeIsComplete('Salario', 5_000_000, 5_000_000), true);
assert.equal(guessIncomeIsComplete('Salario', 600_000, 5_000_000), false);
assert.equal(guessIncomeIsComplete('Salario', 2_500_000, 2_500_000), true); // quincena
assert.equal(guessIncomeIsComplete('Salario', 600_000, 2_500_000), false);
assert.equal(guessIncomeIsComplete('Freelance', 5_000_000, 5_000_000), true);
assert.equal(guessIncomeIsComplete('Freelance', 600_000, 5_000_000), false);
assert.equal(guessIncomeIsComplete('Bonus', 4_300_000, 5_000_000), true); // >= 85%
assert.equal(guessIncomeIsComplete('Bonus', 4_000_000, 5_000_000), false); // < 85%, no salario
assert.equal(guessIncomeIsComplete('Salario', 4_000_000, 5_000_000), true); // salario, no claramente parcial
assert.equal(guessIncomeIsComplete('Otro', 100_000, 0), true); // sin perfil → default on

console.log('incomeCompleteDefault check ok');
