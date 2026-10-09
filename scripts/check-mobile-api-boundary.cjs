const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const scanRoots = ['app', 'services', 'store', 'components', 'storage', 'constants'];
const allowedFiles = new Set([
  path.normalize('services/payments/paymentService.ts'),
  path.normalize('services/subscriptions/subscriptionDeliveryService.ts'),
  path.normalize('services/auth/customerOtpApi.ts'),
]);

const forbiddenPatterns = [
  /EXPO_PUBLIC_WEBSITE_API_URL/,
  /\/api\/customer\//,
  /\/api\/orders?\b/,
  /\/api\/subscriptions?\b/,
  /\/api\/products?\b/,
  /\/api\/profile\b/,
  /\/api\/notifications?\b/,
  /\/api\/feedback\b/,
];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const violations = [];
for (const relativeRoot of scanRoots) {
  const dir = path.join(root, relativeRoot);
  if (!fs.existsSync(dir)) continue;
  for (const file of walk(dir)) {
    const relativeFile = path.relative(root, file);
    if (allowedFiles.has(path.normalize(relativeFile))) continue;
    const source = fs.readFileSync(file, 'utf8');
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(source)) {
        violations.push(`${relativeFile}: matched ${pattern}`);
      }
    }
  }
}

if (violations.length) {
  console.error('Mobile API boundary check failed. Website APIs are allowed only in the approved payment and subscription-delivery service boundaries.');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log('Mobile API boundary check passed.');
