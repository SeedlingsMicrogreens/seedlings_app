import type { Product } from '../products/productService';
import { resolvePriceDisplay } from '../products/priceDisplay';

export type CartItem = Product & {
  quantity: number;
  selectedWeight: string;
  /** Stable customer-facing position across one-time/subscription mode switches. */
  cartPosition?: number;
  /** Resolved customer delivery date after availability validation. */
  deliveryDate?: string;
  sellingOptionId?: string;
  sellingOptionLabel?: string;
};

export type SubscriptionCartItem = CartItem & {
  planId: string;
  planName: string;
  frequency?: string;
  deliveriesPerTerm?: number;
  deliveryChargeMode?: string;
  deliveryCharge?: number;
  startDate: string;
  deliveryDate?: string;
};

export type UnifiedCart = {
  oneTimeItems: CartItem[];
  subscriptionItems: SubscriptionCartItem[];
};

export function getCartItemCount<T extends { quantity: number }, U extends { quantity: number }>(
  cart: T[],
  subscriptionCart: U[],
): number {
  return cart.reduce((sum, item) => sum + item.quantity, 0)
    + subscriptionCart.reduce((sum, item) => sum + item.quantity, 0);
}

export type CartTotals = {
  mrpSubtotal: number;
  subtotal: number;
  savings: number;
  delivery: number;
  total: number;
};

export function replaceProductCartSelectionInCart(input: {
  product: Pick<Product, 'id' | 'name' | 'defaultWeight' | 'price' | 'mrp' | 'sellingOptions'>;
  mode: 'one-time' | 'subscription';
  quantity: number;
  plan?: {
    id: string;
    name?: string;
    frequency?: string;
    deliveriesPerTerm?: number;
    price?: number;
    maximumPlanPrice?: number;
    sellingOptionId?: string;
    sellingOptionLabel?: string;
    weightGrams?: number;
    deliveryChargeMode?: string;
    deliveryCharge?: number;
  };
  startDate?: string;
  oneTimeItems: CartItem[];
  subscriptionItems: SubscriptionCartItem[];
}): UnifiedCart {
  const { product, mode, quantity, plan, startDate, oneTimeItems, subscriptionItems } = input;
  const normalizedQuantity = Math.max(1, Math.floor(Number(quantity) || 1));
  const cartPosition = [...oneTimeItems, ...subscriptionItems]
    .filter((item) => item.id === product.id)
    .map((item) => Number(item.cartPosition))
    .find((value) => Number.isFinite(value))
    ?? (() => {
      const positions = [...oneTimeItems, ...subscriptionItems]
        .map((item) => Number(item.cartPosition))
        .filter((value) => Number.isFinite(value));
      return positions.length ? Math.max(...positions) + 1 : 0;
    })();

  const nextOneTimeItems = oneTimeItems.filter((item) => item.id !== product.id);
  const nextSubscriptionItems = subscriptionItems.filter((item) => item.id !== product.id);

  if (mode === 'one-time') {
    const option = (product.sellingOptions ?? []).filter((item) => item.active !== false && Number(item.weightGrams) > 0).sort((a, b) => Number(a.weightGrams) - Number(b.weightGrams))[0];
    const weightGrams = Number(option?.weightGrams) > 0 ? Number(option.weightGrams) : Number.parseInt(String(product.defaultWeight ?? '').replace(/[^0-9.]/g, ''), 10) || 100;
    const selectedWeight = weightGrams >= 1000 && weightGrams % 1000 === 0 ? `${weightGrams / 1000}kg` : `${weightGrams}g`;
    nextOneTimeItems.push({
      ...product,
      quantity: normalizedQuantity,
      cartPosition,
      selectedWeight,
      ...(option ? { price: Number(option.price), mrp: Number(option.mrp), sellingOptionId: option.id, sellingOptionLabel: `${selectedWeight} box` } : {}),
    } as CartItem);
    return { oneTimeItems: nextOneTimeItems, subscriptionItems: nextSubscriptionItems };
  }

  if (!plan?.id || !startDate) {
    return { oneTimeItems: nextOneTimeItems, subscriptionItems: nextSubscriptionItems };
  }

  const weightGrams = Number(plan.weightGrams) > 0 ? Number(plan.weightGrams) : 100;
  const selectedWeight = weightGrams >= 1000 && weightGrams % 1000 === 0 ? `${weightGrams / 1000}kg` : `${weightGrams}g`;
  nextSubscriptionItems.push({
    ...product,
    quantity: normalizedQuantity,
    cartPosition,
    selectedWeight,
    price: Number(plan.price ?? product.price ?? 0),
    mrp: Number(plan.maximumPlanPrice ?? plan.price ?? 0),
    planId: String(plan.id),
    planName: plan.name || 'Subscription',
    ...(plan.frequency ? { frequency: plan.frequency } : {}),
    ...(Number.isFinite(Number(plan.deliveriesPerTerm)) ? { deliveriesPerTerm: Number(plan.deliveriesPerTerm) } : {}),
    ...(plan.sellingOptionId ? { sellingOptionId: plan.sellingOptionId } : {}),
    ...(plan.sellingOptionLabel ? { sellingOptionLabel: plan.sellingOptionLabel } : {}),
    startDate,
  } as SubscriptionCartItem);
  return { oneTimeItems: nextOneTimeItems, subscriptionItems: nextSubscriptionItems };
}

export function getUnifiedCartTotals(cart: UnifiedCart): CartTotals {
  const items = [...cart.oneTimeItems, ...cart.subscriptionItems];
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const savings = items.reduce((sum, item) =>
    sum + (resolvePriceDisplay(item.price, item.mrp).savings ?? 0) * item.quantity, 0);
  const mrpSubtotal = subtotal + savings;
  return { mrpSubtotal, subtotal, savings, delivery: 0, total: subtotal };
}

export function getCartTotals(items: CartItem[]): CartTotals {
  return getUnifiedCartTotals({ oneTimeItems: items, subscriptionItems: [] });
}

export function findCartItem(items: CartItem[], productId: string) { return items.find((item) => item.id === productId); }

export function cartItemKey(item: Pick<CartItem, 'id'>) { return item.id; }

export function subscriptionCartItemKey(item: Pick<SubscriptionCartItem, 'id' | 'planId' | 'startDate'>) {
  return `subscription:${item.id}:${item.planId}:${item.startDate}`;
}
