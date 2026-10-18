// Fails when the mobile copy of the shared checkout pricing rules differs from
// the Website's. Usage: WEBSITE_DIR=/path/to/seedlings_website npm run check:pricing-parity
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const websiteDir = process.env.WEBSITE_DIR;
if (!websiteDir) {
  console.error('Set WEBSITE_DIR to the Seedlings Website checkout (the folder containing lib/checkoutPricing.ts).');
  process.exit(2);
}

const files = [
  ['lib/checkoutPricing.ts', 'services/orders/checkoutPricing.ts'],
  ['lib/packaging.ts', 'services/orders/packaging.ts'],
];
let drifted = false;
for (const [websiteFile, mobileFile] of files) {
  const same = readFileSync(join(websiteDir, websiteFile), 'utf8') === readFileSync(mobileFile, 'utf8');
  console.log(`${same ? 'same   ' : 'DRIFTED'} ${mobileFile} <- ${websiteFile}`);
  drifted ||= !same;
}
if (drifted) {
  console.error('Copy the Website files over the mobile copies unchanged; payments fail when they differ.');
  process.exit(1);
}
