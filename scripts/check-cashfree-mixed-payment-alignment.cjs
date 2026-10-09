const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const mobilePayment = fs.readFileSync(path.join(root, 'services/payments/paymentService.ts'), 'utf8');
const checkout = fs.readFileSync(path.join(root, 'app/(customer)/checkout/index.tsx'), 'utf8');
const subscriptions = fs.readFileSync(path.join(root, 'app/(customer)/account/subscriptions.tsx'), 'utf8');

const checks = [
  ['single Cashfree session entry point', /createCashfreePaymentSession\(\s*orderIds,\s*mobile\)/s.test(checkout)],
  ['mixed checkout sends one-time + subscription order IDs', /paymentAttempt\.oneTimeOrderId[\s\S]*paymentAttempt\.subscriptionOrderIds/.test(checkout)],
  ['subscription management has no separate payment entry point', !/createCashfreePaymentSession\(/s.test(subscriptions)],
  ['session API accepts an order ID array', /orderIds: string\[\]/.test(mobilePayment)],
  ['duplicate order IDs are removed before API call', /new Set\(orderIds\.filter\(Boolean\)\)/.test(mobilePayment)],
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error('Cashfree mixed-payment alignment check FAILED:');
  for (const [name] of failed) console.error(`- ${name}`);
  process.exit(1);
}
console.log(`Cashfree mixed-payment alignment check passed (${checks.length} checks).`);
