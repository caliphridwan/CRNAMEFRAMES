// Pricing rules for the shop. Kept in one place so orders.js (creating
// orders) and anything else that needs a price all agree.
//
// Bundle deal: every group of BUNDLE_SIZE names costs BUNDLE_PRICE flat;
// any remainder beyond the last full bundle is charged at the regular
// per-name price. Mirrors the frontend's computeTotal() in index.html —
// keep the two in sync if this ever changes.

const PRICE_PER_NAME = 20000; // NGN
const BUNDLE_SIZE = 3;
const BUNDLE_PRICE = 50000; // NGN — instead of 3 × 20,000 = 60,000

function computeSubtotal(count) {
  return count * PRICE_PER_NAME;
}

function computeTotal(count) {
  const bundles = Math.floor(count / BUNDLE_SIZE);
  const remainder = count % BUNDLE_SIZE;
  return bundles * BUNDLE_PRICE + remainder * PRICE_PER_NAME;
}

module.exports = { PRICE_PER_NAME, BUNDLE_SIZE, BUNDLE_PRICE, computeSubtotal, computeTotal };
