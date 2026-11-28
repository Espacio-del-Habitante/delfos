import assert from 'node:assert/strict';

function stripAiKeyFromSettings(settings) {
  const next = structuredClone(settings);
  if (next.ai) next.ai = { ...next.ai, api_key: '' };
  return next;
}

const raw = {
  budgetDefault: 1,
  ai: { provider: 'gemini', api_key: 'AIzaSECRET123456', text_model: 'x' },
};
const clean = stripAiKeyFromSettings(raw);
assert.equal(clean.ai.api_key, '');
assert.equal(raw.ai.api_key, 'AIzaSECRET123456'); // no muta original
assert.equal(clean.ai.provider, 'gemini');

console.log('secureSecrets.check ok');
