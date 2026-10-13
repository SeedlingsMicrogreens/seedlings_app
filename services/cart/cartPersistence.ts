import type { Product } from '../products/productService';
import type { CartItem, SubscriptionCartItem, UnifiedCart } from './cartService';
import { getDatabase } from '../../storage/sqlite';

export type CartScope =
  | { kind: 'guest' }
  | { kind: 'customer'; mobile: string };

export type PersistedCartItem = Product & {
  quantity: number;
  selectedWeight: string;
  cartPosition?: number;
  purchaseMode?: 'one-time' | 'subscription';
  subscriptionPlanId?: string;
  planId?: string;
  planName?: string;
  frequency?: string;
  deliveriesPerTerm?: number;
  deliveryChargeMode?: string;
  deliveryCharge?: number;
  startDate?: string;
  deliveryDate?: string;
};

function normalizeMobile(mobile: string): string {
  return String(mobile || '').replace(/\D/g, '');
}

function scopePrefix(scope: CartScope): string {
  if (scope.kind === 'guest') return 'guest:';
  const mobile = normalizeMobile(scope.mobile);
  if (!mobile) throw new Error('Customer cart scope requires a valid mobile number.');
  return `customer:${mobile}:`;
}

function oneTimeCartKey(scope: CartScope, productId: string) {
  return `${scopePrefix(scope)}one-time:${productId}`;
}

function subscriptionCartKey(scope: CartScope, productId: string, planId: string, startDate: string) {
  return `${scopePrefix(scope)}subscription:${productId}:${planId}:${startDate}`;
}

function isScopedKey(cartKey: string): boolean {
  return cartKey.startsWith('guest:') || cartKey.startsWith('customer:');
}

function isLegacyKey(cartKey: string): boolean {
  return !isScopedKey(cartKey);
}

function loadRows(): Array<{ cart_key: string; product_id: string; selected_weight: string; quantity: number; product_json: string }> {
  return getDatabase().getAllSync<{ cart_key: string; product_id: string; selected_weight: string; quantity: number; product_json: string }>(
    'SELECT cart_key, product_id, selected_weight, quantity, product_json FROM cart_items ORDER BY updated_at ASC',
  );
}

function parseRows(rows: Array<{ cart_key: string; product_id: string; selected_weight: string; quantity: number; product_json: string }>): UnifiedCart {
  const oneTimeItems: CartItem[] = [];
  const subscriptionItems: SubscriptionCartItem[] = [];

  rows.forEach((row, rowIndex) => {
    let parsed: PersistedCartItem;
    try { parsed = JSON.parse(row.product_json) as PersistedCartItem; }
    catch { return; }

    const quantity = Math.max(1, Math.floor(row.quantity));
    const base = {
      ...parsed,
      quantity,
      selectedWeight: row.selected_weight || parsed.selectedWeight || parsed.defaultWeight || 'Pack',
      cartPosition: Number.isFinite(Number(parsed.cartPosition)) ? Number(parsed.cartPosition) : rowIndex,
    };

    const isSubscription = parsed.purchaseMode === 'subscription' || Boolean(parsed.planId || parsed.subscriptionPlanId);
    if (isSubscription) {
      // A subscription cart entry is valid only when the Website contract fields are present.
      if (parsed.planId && parsed.startDate) {
        subscriptionItems.push({
        ...base,
        planId: parsed.planId,
        planName: parsed.planName || 'Subscription',
        ...(parsed.frequency ? { frequency: parsed.frequency } : {}),
        ...(Number.isFinite(Number(parsed.deliveriesPerTerm)) ? { deliveriesPerTerm: Number(parsed.deliveriesPerTerm) } : {}),
        ...(parsed.deliveryChargeMode ? { deliveryChargeMode: parsed.deliveryChargeMode } : {}),
        ...(Number.isFinite(Number(parsed.deliveryCharge)) ? { deliveryCharge: Number(parsed.deliveryCharge) } : {}),
          startDate: parsed.startDate,
          ...(parsed.deliveryDate ? { deliveryDate: parsed.deliveryDate } : {}),
        });
      }
    } else {
      oneTimeItems.push(base);
    }
  });

  return {
    oneTimeItems: oneTimeItems.sort((a, b) => (a.cartPosition ?? 0) - (b.cartPosition ?? 0)),
    subscriptionItems: subscriptionItems.sort((a, b) => (a.cartPosition ?? 0) - (b.cartPosition ?? 0)),
  };
}

export function loadUnifiedCart(scope: CartScope): UnifiedCart {
  const prefix = scopePrefix(scope);
  const rows = loadRows().filter((row) => row.cart_key.startsWith(prefix));
  return parseRows(rows);
}

export function loadCart(scope: CartScope): CartItem[] {
  return loadUnifiedCart(scope).oneTimeItems;
}

export function loadLegacyUnifiedCart(): UnifiedCart {
  return parseRows(loadRows().filter((row) => isLegacyKey(row.cart_key)));
}

export function hasScopedCart(scope: CartScope): boolean {
  const prefix = scopePrefix(scope);
  return loadRows().some((row) => row.cart_key.startsWith(prefix));
}

export function hasLegacyCart(): boolean {
  return loadRows().some((row) => isLegacyKey(row.cart_key));
}

export function upsertCartItem(scope: CartScope, item: CartItem) {
  getDatabase().runSync(
    `INSERT INTO cart_items (cart_key, product_id, selected_weight, quantity, product_json, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(cart_key) DO UPDATE SET quantity = excluded.quantity, product_json = excluded.product_json, selected_weight = excluded.selected_weight, updated_at = excluded.updated_at`,
    oneTimeCartKey(scope, item.id), item.id, item.selectedWeight, item.quantity, JSON.stringify(item), Date.now(),
  );
}

export function upsertSubscriptionCartItem(scope: CartScope, item: SubscriptionCartItem) {
  const persisted: PersistedCartItem = { ...item, purchaseMode: 'subscription' };
  getDatabase().runSync(
    `INSERT INTO cart_items (cart_key, product_id, selected_weight, quantity, product_json, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(cart_key) DO UPDATE SET quantity = excluded.quantity, product_json = excluded.product_json, selected_weight = excluded.selected_weight, updated_at = excluded.updated_at`,
    subscriptionCartKey(scope, item.id, item.planId, item.startDate), item.id, item.selectedWeight, item.quantity, JSON.stringify(persisted), Date.now(),
  );
}

export function removeCartItem(scope: CartScope, productId: string) {
  getDatabase().runSync(`DELETE FROM cart_items WHERE cart_key = ?`, oneTimeCartKey(scope, productId));
}

export function removeSubscriptionCartItem(scope: CartScope, productId: string, planId: string, startDate: string) {
  getDatabase().runSync(`DELETE FROM cart_items WHERE cart_key = ?`, subscriptionCartKey(scope, productId, planId, startDate));
}

export function replaceUnifiedCart(scope: CartScope, cart: UnifiedCart) {
  const db = getDatabase();
  const prefix = scopePrefix(scope);
  const rows = loadRows().filter((row) => row.cart_key.startsWith(prefix));
  db.withTransactionSync(() => {
    for (const row of rows) db.runSync(`DELETE FROM cart_items WHERE cart_key = ?`, row.cart_key);
    for (const item of cart.oneTimeItems) upsertCartItem(scope, item);
    for (const item of cart.subscriptionItems) upsertSubscriptionCartItem(scope, item);
  });
}

export function replaceCart(scope: CartScope, items: CartItem[]) {
  replaceUnifiedCart(scope, { oneTimeItems: items, subscriptionItems: [] });
}

export function clearPersistedCart(scope: CartScope) {
  const prefix = scopePrefix(scope);
  const rows = loadRows().filter((row) => row.cart_key.startsWith(prefix));
  const db = getDatabase();
  db.withTransactionSync(() => {
    for (const row of rows) db.runSync(`DELETE FROM cart_items WHERE cart_key = ?`, row.cart_key);
  });
}

export function clearLegacyCart() {
  const rows = loadRows().filter((row) => isLegacyKey(row.cart_key));
  const db = getDatabase();
  db.withTransactionSync(() => {
    for (const row of rows) db.runSync(`DELETE FROM cart_items WHERE cart_key = ?`, row.cart_key);
  });
}

/**
 * Phase 31 migration for carts created before account-scoped persistence existed.
 * The old cart has no reliable account ownership. It is migrated exactly once to
 * the currently active scope so existing local data is not silently discarded.
 */
export function migrateLegacyCartToScope(scope: CartScope): UnifiedCart | null {
  if (!hasLegacyCart()) return null;
  const legacy = loadLegacyUnifiedCart();
  replaceUnifiedCart(scope, legacy);
  clearLegacyCart();
  return legacy;
}

/**
 * Merge guest cart into one customer cart using the same independent keys as the
 * Website: one-time by product, subscription by product + plan + start date.
 */
export function mergeGuestCartIntoCustomer(mobile: string): UnifiedCart {
  const customerScope: CartScope = { kind: 'customer', mobile };
  const guest = loadUnifiedCart({ kind: 'guest' });
  const customer = loadUnifiedCart(customerScope);

  const oneTime = [...customer.oneTimeItems];
  for (const guestItem of guest.oneTimeItems) {
    const existing = oneTime.find((item) => item.id === guestItem.id);
    if (existing) existing.quantity += guestItem.quantity;
    else oneTime.push(guestItem);
  }

  const subscription = [...customer.subscriptionItems];
  for (const guestItem of guest.subscriptionItems) {
    const existing = subscription.find((item) =>
      item.id === guestItem.id &&
      item.planId === guestItem.planId &&
      item.startDate === guestItem.startDate,
    );
    if (existing) existing.quantity += guestItem.quantity;
    else subscription.push(guestItem);
  }

  const merged = { oneTimeItems: oneTime, subscriptionItems: subscription };
  replaceUnifiedCart(customerScope, merged);
  clearPersistedCart({ kind: 'guest' });
  return merged;
}
