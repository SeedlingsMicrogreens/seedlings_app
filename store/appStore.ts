import { create } from 'zustand';
import { logoutCustomer, persistCustomerSession, restoreCustomerSession } from '../services/auth/customerSession';
import { disableCustomerPushNotifications } from '../services/notifications/pushNotificationService';
import { getDefaultOneTimeSellingOption } from '../services/products/productService';
import type { Product } from '../services/products/productService';
import {
  clearPersistedCart,
  loadUnifiedCart,
  mergeGuestCartIntoCustomer,
  migrateLegacyCartToScope,
  removeCartItem,
  removeSubscriptionCartItem,
  replaceUnifiedCart,
  upsertCartItem,
  upsertSubscriptionCartItem,
  type CartScope,
} from '../services/cart/cartPersistence';
import { replaceProductCartSelectionInCart, type CartItem, type SubscriptionCartItem, type UnifiedCart } from '../services/cart/cartService';
import { parseWeightGrams } from '../services/orders/weightUtils';

const guestScope: CartScope = { kind: 'guest' };

const customerScope = (mobile: string): CartScope => ({ kind: 'customer', mobile });

const emptyCart = (): UnifiedCart => ({ oneTimeItems: [], subscriptionItems: [] });

const normalizeMobile = (mobile: string) => String(mobile || '').replace(/\D/g, '');

const scopeFor = (state: Pick<State, 'authenticated' | 'mobile'>): CartScope =>
  state.authenticated && normalizeMobile(state.mobile)
    ? customerScope(state.mobile)
    : guestScope;

const nextCartPosition = (state: Pick<State, 'cart' | 'subscriptionCart'>) => {
  const positions = [...state.cart, ...state.subscriptionCart]
    .map((item) => Number(item.cartPosition))
    .filter((value) => Number.isFinite(value));
  return positions.length ? Math.max(...positions) + 1 : 0;
};

const positionForProduct = (state: Pick<State, 'cart' | 'subscriptionCart'>, productId: string) => {
  const existing = [...state.cart, ...state.subscriptionCart].find((item) => item.id === productId);
  return existing?.cartPosition ?? nextCartPosition(state);
};

type State = {
  mobile: string;
  authenticated: boolean;
  cart: CartItem[];
  subscriptionCart: SubscriptionCartItem[];
  cartHydrated: boolean;
  sessionHydrated: boolean;
  setMobile: (mobile: string) => void;
  login: (mobile?: string) => Promise<void>;
  logout: () => Promise<void>;
  hydrateCart: () => void;
  hydrateSession: () => Promise<void>;
  addToCart: (product: Product, weight?: string) => void;
  addSubscriptionToCart: (product: Product, plan: { id: string; name?: string; frequency?: string; deliveriesPerTerm?: number; price?: number; maximumPlanPrice?: number; deliveryChargeMode?: string; deliveryCharge?: number; sellingOptionId?: string; sellingOptionLabel?: string; weightGrams?: number }, startDate: string, quantity?: number) => void;
  setCartPackaging: (productId: string, weightGrams: number, price: number, mrp: number, sellingOptionId?: string, sellingOptionLabel?: string) => void;
  setSubscriptionCartPackaging: (productId: string, planId: string, startDate: string, weightGrams: number, price: number, sellingOptionId?: string, sellingOptionLabel?: string, maximumPlanPrice?: number) => void;
  removeFromCart: (id: string, weight?: string) => void;
  removeSubscriptionFromCart: (productId: string, planId: string, startDate: string) => void;
  changeQuantity: (id: string, delta: number, weight?: string) => void;
  changeSubscriptionQuantity: (productId: string, planId: string, startDate: string, delta: number) => void;
  clearCart: () => void;
  refreshCartProducts: (products: Product[]) => void;
  replaceProductCartSelection: (input: { product: Product; mode: 'one-time' | 'subscription'; quantity: number; plan?: { id: string; name?: string; frequency?: string; deliveriesPerTerm?: number; price?: number; maximumPlanPrice?: number; sellingOptionId?: string; sellingOptionLabel?: string; weightGrams?: number; deliveryChargeMode?: string; deliveryCharge?: number }; startDate?: string }) => void;
  applyCartDeliveryDates: (dates: Record<string, string | null>) => void;
};

const applyCart = (set: any, cart: UnifiedCart) => {
  set({ cart: cart.oneTimeItems, subscriptionCart: cart.subscriptionItems, cartHydrated: true });
};

export const useAppStore = create<State>((set, get) => ({
  mobile: '', authenticated: false, cart: [], subscriptionCart: [], cartHydrated: false, sessionHydrated: false,
  setMobile: (mobile) => set({ mobile }),

  login: async (mobile) => {
    const customerMobile = normalizeMobile(mobile ?? get().mobile);
    if (!customerMobile) throw new Error('Invalid customer mobile number.');

    persistCustomerSession(customerMobile);

    // Preserve a pre-Phase-31 local cart exactly once, then merge any guest cart
    // into this account using the same one-time/subscription identity rules.
    migrateLegacyCartToScope(customerScope(customerMobile));
    const merged = mergeGuestCartIntoCustomer(customerMobile);

    set({
      mobile: customerMobile,
      authenticated: true,
      cart: merged.oneTimeItems,
      subscriptionCart: merged.subscriptionItems,
      cartHydrated: true,
    });
  },

  logout: async () => {
    // Do not delete the customer's persisted cart. It remains scoped to that
    // account and will be restored if the same customer logs in again.
    try { await disableCustomerPushNotifications(); } catch {}
    try { await logoutCustomer(); }
    finally { set({ mobile: '', authenticated: false, cart: [], subscriptionCart: [], cartHydrated: true }); }
  },

  hydrateSession: async () => {
    try {
      const mobile = await restoreCustomerSession();
      if (mobile) {
        migrateLegacyCartToScope(customerScope(mobile));
        const merged = mergeGuestCartIntoCustomer(mobile);
        set({ mobile, authenticated: true, sessionHydrated: true, cart: merged.oneTimeItems, subscriptionCart: merged.subscriptionItems, cartHydrated: true });
        return;
      }

      migrateLegacyCartToScope(guestScope);
      const cart = loadUnifiedCart(guestScope);
      set({ mobile: '', authenticated: false, sessionHydrated: true, cart: cart.oneTimeItems, subscriptionCart: cart.subscriptionItems, cartHydrated: true });
    } catch {
      migrateLegacyCartToScope(guestScope);
      const cart = loadUnifiedCart(guestScope);
      set({ mobile: '', authenticated: false, sessionHydrated: true, cart: cart.oneTimeItems, subscriptionCart: cart.subscriptionItems, cartHydrated: true });
    }
  },

  hydrateCart: () => {
    try {
      const cart = loadUnifiedCart(scopeFor(get()));
      applyCart(set, cart);
    } catch { applyCart(set, emptyCart()); }
  },

  addToCart: (product, weight) => {
    const defaultOption = getDefaultOneTimeSellingOption(product);
    const explicitWeightGrams = parseWeightGrams(weight, Number.NaN);
    const fallbackWeightGrams = defaultOption?.weightGrams ?? parseWeightGrams(product.defaultWeight, 100);
    const selectedWeightGrams = Number.isFinite(explicitWeightGrams) && explicitWeightGrams > 0
      ? explicitWeightGrams
      : (fallbackWeightGrams || 100);
    const selectedWeight = selectedWeightGrams >= 1000 && selectedWeightGrams % 1000 === 0 ? `${selectedWeightGrams / 1000}kg` : `${selectedWeightGrams}g`;
    const selectedOption = (product.sellingOptions ?? []).find((option) => option.active !== false && option.weightGrams === selectedWeightGrams)
      ?? (Number.isFinite(explicitWeightGrams) && explicitWeightGrams > 0 ? (product.sellingOptions ?? []).find((option) => option.active !== false && Math.abs(option.weightGrams - selectedWeightGrams) < 0.01) : undefined)
      ?? defaultOption;
    const scope = scopeFor(get());
    const existing = get().cart.find((item) => item.id === product.id);
    const selectedOptionValues = selectedOption ? {
      price: selectedOption.price,
      mrp: selectedOption.mrp,
      sellingOptionId: selectedOption.id,
      sellingOptionLabel: `${selectedOption.weightGrams >= 1000 && selectedOption.weightGrams % 1000 === 0 ? `${selectedOption.weightGrams / 1000}kg` : `${selectedOption.weightGrams}g`} box`,
      selectedWeight,
    } : {};
    if (existing) {
      const updated = get().cart.map((item) => item.id === product.id ? { ...item, ...selectedOptionValues, quantity: item.quantity + 1 } : item);
      const next = updated.find((item) => item.id === product.id);
      if (next) upsertCartItem(scope, next);
      set({ cart: updated });
      return;
    }
    const item: CartItem = {
      ...product,
      quantity: 1,
      cartPosition: nextCartPosition(get()),
      selectedWeight,
      ...selectedOptionValues,
    };
    upsertCartItem(scope, item);
    set((state) => ({ cart: [...state.cart, item] }));
  },

  addSubscriptionToCart: (product, plan, startDate, quantity = 1) => {
    const planId = String(plan.id);
    const normalizedQuantity = Math.max(1, Math.floor(quantity));
    const scope = scopeFor(get());
    const existing = get().subscriptionCart.find((item) => item.id === product.id && item.planId === planId && item.startDate === startDate);
    if (existing) {
      const selectedPrice = Number(plan.price ?? product.price ?? 0);
      const selectedWeight = Number(plan.weightGrams) > 0
        ? (Number(plan.weightGrams) >= 1000 && Number(plan.weightGrams) % 1000 === 0 ? `${Number(plan.weightGrams) / 1000}kg` : `${Number(plan.weightGrams)}g`)
        : product.defaultWeight;
      const referencePrice = Number(plan.maximumPlanPrice);
      const updated = get().subscriptionCart.map((item) =>
        item.id === product.id && item.planId === planId && item.startDate === startDate
          ? {
              ...item,
              quantity: item.quantity + normalizedQuantity,
              selectedWeight,
              price: selectedPrice,
              mrp: Number.isFinite(referencePrice) ? referencePrice : selectedPrice,
              ...(plan.sellingOptionId ? { sellingOptionId: plan.sellingOptionId } : {}),
              ...(plan.sellingOptionLabel ? { sellingOptionLabel: plan.sellingOptionLabel } : {}),
            }
          : item);
      const next = updated.find((item) => item.id === product.id && item.planId === planId && item.startDate === startDate);
      if (next) upsertSubscriptionCartItem(scope, next);
      set({ subscriptionCart: updated });
      return;
    }
    const subscriptionPrice = Number(plan.price ?? product.price ?? 0);
    const selectedWeight = Number(plan.weightGrams) > 0
      ? (Number(plan.weightGrams) >= 1000 && Number(plan.weightGrams) % 1000 === 0 ? `${Number(plan.weightGrams) / 1000}kg` : `${Number(plan.weightGrams)}g`)
      : product.defaultWeight;
    const referencePrice = Number(plan.maximumPlanPrice);
    const item: SubscriptionCartItem = { ...product, quantity: normalizedQuantity, cartPosition: nextCartPosition(get()), selectedWeight, price: subscriptionPrice, mrp: Number.isFinite(referencePrice) ? referencePrice : subscriptionPrice, planId, planName: plan.name || 'Subscription', ...(plan.sellingOptionId ? { sellingOptionId: plan.sellingOptionId } : {}), ...(plan.sellingOptionLabel ? { sellingOptionLabel: plan.sellingOptionLabel } : {}), ...(plan.frequency ? { frequency: plan.frequency } : {}), ...(Number.isFinite(Number(plan.deliveriesPerTerm)) ? { deliveriesPerTerm: Number(plan.deliveriesPerTerm) } : {}), ...(plan.deliveryChargeMode ? { deliveryChargeMode: plan.deliveryChargeMode } : {}), ...(Number.isFinite(Number(plan.deliveryCharge)) ? { deliveryCharge: Number(plan.deliveryCharge) } : {}), startDate };
    upsertSubscriptionCartItem(scope, item);
    set((state) => ({ subscriptionCart: [...state.subscriptionCart, item] }));
  },

  setCartPackaging: (productId, weightGrams, price, mrp, sellingOptionId, sellingOptionLabel) => {
    const scope = scopeFor(get());
    const updated = get().cart.map((item) => item.id === productId ? { ...item, selectedWeight: weightGrams >= 1000 && weightGrams % 1000 === 0 ? `${weightGrams / 1000}kg` : `${weightGrams}g`, price, mrp, ...(sellingOptionId ? { sellingOptionId } : {}), ...(sellingOptionLabel ? { sellingOptionLabel } : {}) } : item);
    set({ cart: updated });
    const next = updated.find((item) => item.id === productId);
    if (next) upsertCartItem(scope, next);
  },

  setSubscriptionCartPackaging: (productId, planId, startDate, weightGrams, price, sellingOptionId, sellingOptionLabel, maximumPlanPrice) => {
    const scope = scopeFor(get());
    const updated = get().subscriptionCart.map((item) => item.id === productId && item.planId === planId && item.startDate === startDate ? { ...item, selectedWeight: weightGrams >= 1000 && weightGrams % 1000 === 0 ? `${weightGrams / 1000}kg` : `${weightGrams}g`, price, mrp: Number(maximumPlanPrice ?? price), ...(sellingOptionId ? { sellingOptionId } : {}), ...(sellingOptionLabel ? { sellingOptionLabel } : {}) } : item);
    set({ subscriptionCart: updated });
    const next = updated.find((item) => item.id === productId && item.planId === planId && item.startDate === startDate);
    if (next) upsertSubscriptionCartItem(scope, next);
  },

  removeFromCart: (id) => { const scope = scopeFor(get()); set((state) => ({ cart: state.cart.filter((item) => item.id !== id) })); removeCartItem(scope, id); },
  removeSubscriptionFromCart: (productId, planId, startDate) => { const scope = scopeFor(get()); set((state) => ({ subscriptionCart: state.subscriptionCart.filter((item) => !(item.id === productId && item.planId === planId && item.startDate === startDate)) })); removeSubscriptionCartItem(scope, productId, planId, startDate); },

  changeQuantity: (id, delta) => {
    const existing = get().cart.find((item) => item.id === id); if (!existing) return;
    const scope = scopeFor(get());
    const nextQuantity = Math.max(1, existing.quantity + delta); const updated = get().cart.map((item) => item.id === id ? { ...item, quantity: nextQuantity } : item);
    set({ cart: updated }); const next = updated.find((item) => item.id === id); if (next) upsertCartItem(scope, next);
  },

  changeSubscriptionQuantity: (productId, planId, startDate, delta) => {
    const existing = get().subscriptionCart.find((item) => item.id === productId && item.planId === planId && item.startDate === startDate); if (!existing) return;
    const scope = scopeFor(get());
    const nextQuantity = Math.max(1, existing.quantity + delta); const updated = get().subscriptionCart.map((item) => item.id === productId && item.planId === planId && item.startDate === startDate ? { ...item, quantity: nextQuantity } : item);
    set({ subscriptionCart: updated }); const next = updated.find((item) => item.id === productId && item.planId === planId && item.startDate === startDate); if (next) upsertSubscriptionCartItem(scope, next);
  },

  clearCart: () => { clearPersistedCart(scopeFor(get())); set({ cart: [], subscriptionCart: [] }); },

  replaceProductCartSelection: (input) => {
    const state = get();
    const scope = scopeFor(state);
    const unified = replaceProductCartSelectionInCart({
      ...input,
      oneTimeItems: state.cart,
      subscriptionItems: state.subscriptionCart,
    });
    set({ cart: unified.oneTimeItems, subscriptionCart: unified.subscriptionItems });
    replaceUnifiedCart(scope, unified);
  },

  applyCartDeliveryDates: (dates) => {
    const scope = scopeFor(get());
    const oneTime = get().cart.map((item) => {
      const key = `one-time:${item.id}`;
      const deliveryDate = dates[key] ?? item.deliveryDate;
      return deliveryDate ? { ...item, deliveryDate } : item;
    });
    const subscriptions = get().subscriptionCart.map((item) => {
      const key = `subscription:${item.id}:${item.planId}:${item.startDate}`;
      const deliveryDate = dates[key] ?? item.deliveryDate;
      return deliveryDate ? { ...item, deliveryDate } : item;
    });
    const unified = { oneTimeItems: oneTime, subscriptionItems: subscriptions };
    set({ cart: oneTime, subscriptionCart: subscriptions });
    replaceUnifiedCart(scope, unified);
  },

  refreshCartProducts: (products) => {
    const byId = new Map(products.map((product) => [product.id, product]));
    const oneTime = get().cart.map((item) => {
      const product = byId.get(item.id);
      return product ? {
        ...product,
        quantity: item.quantity,
        cartPosition: item.cartPosition,
        selectedWeight: item.selectedWeight,
        price: item.price,
        mrp: item.mrp,
        currency: item.currency,
        imageUrl: item.imageUrl,
        ...(item.sellingOptionId ? { sellingOptionId: item.sellingOptionId } : {}),
        ...(item.sellingOptionLabel ? { sellingOptionLabel: item.sellingOptionLabel } : {}),
      } : item;
    });
    const subscriptions = get().subscriptionCart.map((item) => { const product = byId.get(item.id); return product ? { ...product, quantity: item.quantity, cartPosition: item.cartPosition, selectedWeight: item.selectedWeight, price: item.price, mrp: item.mrp, currency: item.currency, imageUrl: item.imageUrl, planId: item.planId, planName: item.planName, ...(item.frequency ? { frequency: item.frequency } : {}), ...(item.deliveriesPerTerm !== undefined ? { deliveriesPerTerm: item.deliveriesPerTerm } : {}), ...(item.deliveryChargeMode ? { deliveryChargeMode: item.deliveryChargeMode } : {}), ...(item.deliveryCharge !== undefined ? { deliveryCharge: item.deliveryCharge } : {}), startDate: item.startDate } : item; });
    const unified = { oneTimeItems: oneTime, subscriptionItems: subscriptions };
    set({ cart: oneTime, subscriptionCart: subscriptions });
    replaceUnifiedCart(scopeFor(get()), unified);
  },
}));
