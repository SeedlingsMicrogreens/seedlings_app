import { getDatabase } from '../storage/sqlite';

export type CachedCustomerRecord = {
  mobile: string;
  name?: string;
  email?: string;
  preferredDeliveryDay?: string;
  deliveryDay?: string;
  countryCode?: string;
  phoneE164?: string;
  mobileNumber?: string;
  phone?: string;
  status?: string;
  onboardingStatus?: string;
  photoUrl?: string;
  profilePhotoUrl?: string;
  addresses?: unknown[];
};

const CACHE_TTL_MS = 10 * 60 * 1000;

export function getCachedCustomer(mobile: string): CachedCustomerRecord | null | undefined {
  const row = getDatabase().getFirstSync<{ customer_json: string; cached_at: number }>(
    'SELECT customer_json, cached_at FROM customer_cache WHERE customer_mobile = ?',
    mobile,
  );
  if (!row) return undefined;
  if (Date.now() - Number(row.cached_at) > CACHE_TTL_MS) {
    clearCachedCustomer(mobile);
    return undefined;
  }
  try { return JSON.parse(row.customer_json) as CachedCustomerRecord; } catch { return undefined; }
}

export function setCachedCustomer(mobile: string, customer: CachedCustomerRecord | null): void {
  getDatabase().runSync(
    `INSERT OR REPLACE INTO customer_cache (customer_mobile, customer_json, cached_at) VALUES (?, ?, ?)`,
    mobile,
    JSON.stringify(customer),
    Date.now(),
  );
}

export function clearCachedCustomer(mobile: string): void {
  getDatabase().runSync('DELETE FROM customer_cache WHERE customer_mobile = ?', mobile);
}
