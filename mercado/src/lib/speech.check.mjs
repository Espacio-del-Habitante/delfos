import { speechErrorMessage } from './speech.js';

const cases = [
  ['not-allowed', 'Micrófono bloqueado'],
  ['no-speech', 'No detecté voz'],
  ['network', 'Sin servicio de dictado'],
  ['aborted', 'Dictado cancelado'],
  ['weird', 'Dictado: weird'],
];

for (const [code, needle] of cases) {
  const msg = speechErrorMessage(code);
  if (!msg.includes(needle)) {
    console.error('speech check fail', code, msg);
    process.exit(1);
  }
}

console.log('speech check ok');
