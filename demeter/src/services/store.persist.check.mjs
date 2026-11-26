import assert from 'node:assert/strict';

/** Mirror of store strip + quota detect (no RN deps). */
function isStorageQuotaError(e) {
  const name = e && typeof e === 'object' && 'name' in e ? String(e.name) : '';
  const msg = String(e && typeof e === 'object' && 'message' in e ? e.message : e || '');
  return name === 'QuotaExceededError' || /quota|storage/i.test(msg);
}

function stripAllPhotos(state) {
  for (const t of state.trips) {
    if (t.receipt?.photoDataUrl) t.receipt = { ...t.receipt, photoDataUrl: null };
    for (const it of t.items || []) {
      if (it.photoDataUrl) it.photoDataUrl = null;
    }
  }
  for (const p of Object.values(state.products)) {
    p.photos = [];
  }
}

assert.equal(isStorageQuotaError(new Error('The quota has been exceeded.')), true);
assert.equal(isStorageQuotaError({ name: 'QuotaExceededError', message: '' }), true);
assert.equal(isStorageQuotaError(new Error('Failed to fetch')), false);

const fat = 'data:image/jpeg;base64,' + 'A'.repeat(50_000);
const state = {
  trips: [
    {
      receipt: { photoDataUrl: fat },
      items: [
        { photoDataUrl: fat },
        { photoDataUrl: 'data:image/jpeg;base64,' + 'B'.repeat(20_000) },
      ],
    },
  ],
  products: { yogurt: { photos: [fat, fat] } },
};

stripAllPhotos(state);
assert.equal(state.trips[0].receipt.photoDataUrl, null);
assert.equal(state.trips[0].items.every((i) => i.photoDataUrl == null), true);
assert.deepEqual(state.products.yogurt.photos, []);
assert.ok(JSON.stringify(state).length < fat.length);

console.log('store.persist.check ok');
