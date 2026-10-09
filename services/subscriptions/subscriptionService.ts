import { collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch } from '../core/firestore';
import { auth, db } from '../core/firebaseClient';
import { normalizeIndianMobile } from '../clientOnboarding';
import { stripUndefined } from '../core/firestoreData';
import { buildSubscriptionDeliveryDates, calculateUniqueDateCheckoutDeliveryCharges } from '../orders/deliveryChargeService';
import { isProductSubscriptionEligible } from '../products/subscriptionEligibility';
import { getSubscriptionPlanPriceForSellingOption as resolveSubscriptionPlanPriceForSellingOption } from './subscriptionPlanPrice';

export type SubscriptionPlanSellingOption = {
  id?: string;
  sellingOptionId?: string;
  sellingOptionLabel?: string;
  weightGrams?: number;
  planPrice?: number;
};

export type SubscriptionPlan = {
  id: string;
  name: string;
  productId?: string;
  frequency: string;
  price: number;
  sellingOptions?: SubscriptionPlanSellingOption[];
  deliveriesPerTerm?: number;
  active: boolean;
  sortOrder: number;
  deliveryChargeMode?: string;
  deliveryCharge?: number;
};

export type CustomerSubscription = {
  id: string;
  subscriptionNumber?: string;
  customerId: string;
  productId?: string;
  productName?: string;
  sellingOptionLabel?: string;
  quantity?: number;
  frequency?: string;
  status?: string;
  totalDeliveries?: number;
  deliveriesGenerated?: number;
  remainingDeliveries?: number;
  nextDeliveryDate?: string;
  deliveryAddress?: Record<string, unknown>;
  startDate?: string;
  endDate?: string;
  price?: number;
  planId?: string;
  createdAt?: unknown;
};

function num(value: unknown, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function str(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function moneyLabel(grams: number) {
  return grams >= 1000 && grams % 1000 === 0 ? `${grams / 1000}kg box` : `${grams}g box`;
}

function orderNumber() {
  return `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function subscriptionNumber(id: string) {
  return `SUB-${id.slice(0, 8).toUpperCase()}`;
}

function normalizeSellingOptions(sellingOptions: unknown) {
  return Array.isArray(sellingOptions)
    ? sellingOptions.map((item: any) => ({
        ...(item?.id != null ? { id: str(item.id) } : {}),
        ...(item?.sellingOptionId != null ? { sellingOptionId: str(item.sellingOptionId) } : {}),
        ...(item?.sellingOptionLabel != null ? { sellingOptionLabel: str(item.sellingOptionLabel) } : {}),
        ...(item?.weightGrams != null ? { weightGrams: num(item.weightGrams) } : {}),
        ...(item?.planPrice != null ? { planPrice: num(item.planPrice) } : {}),
      }))
    : [];
}

function resolvePlanSellingOption(product: Record<string, unknown>, plan: Record<string, unknown>) {
  const productOptions = normalizeSellingOptions(product.sellingOptions)
    .filter((option) => Number(option.weightGrams) > 0)
    .sort((a, b) => Number(a.weightGrams) - Number(b.weightGrams));
  const planOptions = normalizeSellingOptions(plan.sellingOptions);
  const fallbackProductOption = productOptions[0];
  const fallbackPlanOption = planOptions[0];
  const matchedPlanOption = productOptions.length
    ? planOptions.find((option) => String(option.sellingOptionId ?? option.id ?? '') === String(fallbackProductOption?.id ?? '')) ??
      planOptions.find((option) => Number(option.weightGrams) === Number(fallbackProductOption?.weightGrams))
    : fallbackPlanOption;

  return {
    weightGrams: Number(fallbackProductOption?.weightGrams ?? matchedPlanOption?.weightGrams ?? 0),
    sellingOptionId: String(matchedPlanOption?.sellingOptionId ?? matchedPlanOption?.id ?? fallbackProductOption?.id ?? ''),
    sellingOptionLabel: String(fallbackProductOption?.sellingOptionLabel ?? matchedPlanOption?.sellingOptionLabel ?? (fallbackProductOption ? moneyLabel(Number(fallbackProductOption.weightGrams)) : 'Pack')),
    price: num(matchedPlanOption?.planPrice, num(plan.price)),
  };
}

export async function getActiveSubscriptionPlans(productId?: string): Promise<SubscriptionPlan[]> {
  const normalizedProductId = String(productId ?? '').trim();
  const snapshot = normalizedProductId
    ? await getDocs(query(collection(db, 'subscriptionPlans'), where('salableProductId', '==', normalizedProductId)))
    : await getDocs(query(collection(db, 'subscriptionPlans'), where('active', '==', true)));

  return snapshot.docs.map((docSnapshot) => {
    const data = docSnapshot.data();
    const sellingOptions = normalizeSellingOptions(data.sellingOptions);
    return {
      id: docSnapshot.id,
      name: str(data.name, str(data.frequency, 'Subscription plan')),
      ...(data.salableProductId != null ? { productId: str(data.salableProductId) } : {}),
      frequency: str(data.frequency),
      price: num(data.price),
      ...(sellingOptions.length ? { sellingOptions } : {}),
      ...(data.deliveriesPerTerm != null ? { deliveriesPerTerm: num(data.deliveriesPerTerm) } : {}),
      active: data.active === true,
      sortOrder: num(data.sortOrder),
      ...(data.deliveryChargeMode ? { deliveryChargeMode: str(data.deliveryChargeMode) } : {}),
      ...(data.deliveryCharge != null ? { deliveryCharge: num(data.deliveryCharge) } : {}),
    };
  }).sort((a, b) => a.sortOrder - b.sortOrder || a.price - b.price);
}

export function getSubscriptionPlanPriceForSellingOption(plan: SubscriptionPlan, sellingOptionId?: string): number | undefined {
  return resolveSubscriptionPlanPriceForSellingOption(plan, sellingOptionId);
}

export async function getCustomerSubscriptions(input: string): Promise<CustomerSubscription[]> {
  const mobile = normalizeIndianMobile(input);
  if (!mobile) throw new Error('Invalid customer mobile number.');

  const snapshot = await getDocs(query(collection(db, 'subscriptions'), where('customerId', '==', mobile)));
  return snapshot.docs
    .map((docSnapshot) => {
      const data = docSnapshot.data();
      const total = data.totalDeliveries == null ? undefined : num(data.totalDeliveries);
      const generated = num(data.deliveriesGenerated);
      return {
        id: docSnapshot.id,
        customerId: str(data.customerId, mobile),
        ...(data.subscriptionNumber ? { subscriptionNumber: str(data.subscriptionNumber) } : {}),
        ...(data.productId ? { productId: str(data.productId) } : {}),
        ...(data.productName ? { productName: str(data.productName) } : {}),
        ...(data.sellingOptionLabel ? { sellingOptionLabel: str(data.sellingOptionLabel) } : {}),
        ...(data.quantity != null ? { quantity: Math.max(1, Math.floor(num(data.quantity, 1))) } : {}),
        ...(data.frequency ? { frequency: str(data.frequency) } : {}),
        ...(data.status ? { status: str(data.status) } : {}),
        ...(total !== undefined ? { totalDeliveries: total, remainingDeliveries: Math.max(0, total - generated) } : {}),
        ...(data.deliveriesGenerated != null ? { deliveriesGenerated: generated } : {}),
        ...(data.nextDeliveryDate ? { nextDeliveryDate: str(data.nextDeliveryDate) } : {}),
        ...(data.deliveryAddress ? { deliveryAddress: data.deliveryAddress as Record<string, unknown> } : {}),
        ...(data.startDate ? { startDate: str(data.startDate) } : {}),
        ...(data.endDate ? { endDate: str(data.endDate) } : {}),
        ...(data.price != null ? { price: num(data.price) } : {}),
        ...(data.planId ? { planId: str(data.planId) } : {}),
        ...(data.createdAt ? { createdAt: data.createdAt } : {}),
      } as CustomerSubscription;
    })
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
}

export function isSubscriptionEligible(product: {
  active?: boolean;
  subscriptionPurchase?: boolean;
  type?: 'single' | 'multiple' | string;
  components?: Array<{ productId?: string; quantityGrams?: number | string }>;
}) {
  return isProductSubscriptionEligible(product);
}

export function prettySubscriptionStatus(status?: string) {
  const value = String(status ?? '').trim().toLowerCase();
  return value ? value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase()) : 'Unknown';
}

export type CreateSubscriptionInput = {
  mobile: string;
  productId: string;
  planId: string;
  addressId: string;
  quantity: number;
  startDate: string;
  shortageDecision?: 'continue' | 'contact';
};

export type SubscriptionAction = 'pause' | 'resume' | 'cancel';

export async function createCustomerSubscription(input: CreateSubscriptionInput) {
  const mobile = normalizeIndianMobile(input.mobile);
  if (!mobile) throw new Error('Invalid customer mobile number.');
  const sessionUid = auth.currentUser?.uid;
  if (!sessionUid) throw new Error('Your login session expired. Please sign in again.');

  const productId = String(input.productId ?? '').trim();
  const planId = String(input.planId ?? '').trim();
  const addressId = String(input.addressId ?? '').trim();
  const startDate = String(input.startDate ?? '').trim();
  const quantity = Math.max(1, Math.floor(Number(input.quantity) || 1));

  if (!productId || !planId || !addressId) throw new Error('Choose a product, plan and delivery address.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error('Choose a valid subscription start date.');

  const customerSnapshot = await getDoc(doc(db, 'customers', mobile));
  if (!customerSnapshot.exists()) throw new Error('Customer account not found.');
  const customer = customerSnapshot.data() || {};
  if (customer.status === 'blocked') throw new Error('This customer account is blocked.');

  const addresses = Array.isArray(customer.addresses) ? customer.addresses : [];
  const address = addresses.find((raw) => String((raw as Record<string, unknown>)?.id ?? '') === addressId) as Record<string, unknown> | undefined;
  if (!address) throw new Error('Selected delivery address was not found.');

  const [productSnapshot, planSnapshot] = await Promise.all([
    getDoc(doc(db, 'salesProducts', productId)),
    getDoc(doc(db, 'subscriptionPlans', planId)),
  ]);
  if (!productSnapshot.exists()) throw new Error('Selected product is no longer available.');
  if (!planSnapshot.exists()) throw new Error('Selected subscription plan is no longer available.');

  const product = productSnapshot.data() || {};
  const plan = planSnapshot.data() || {};
  if (!isProductSubscriptionEligible(product as Record<string, unknown>)) throw new Error('Selected product is not eligible for subscriptions.');
  if (plan.active !== true) throw new Error('Selected subscription plan is no longer active.');
  if (plan.salableProductId != null && String(plan.salableProductId) !== productId) throw new Error('Selected subscription plan does not belong to this product.');
  const startDateObject = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(startDateObject.getTime()) || startDateObject.getDay() !== 6) throw new Error('Subscription start date must be a Saturday.');

  const components = Array.isArray(product.components) ? product.components : [];
  if (components.length !== 1) throw new Error('Selected product is not eligible for subscriptions.');

  const component = components[0] as Record<string, unknown> | undefined;
  if (!component?.productId) throw new Error('The selected product has no production product component.');

  const productionSnapshot = await getDoc(doc(db, 'products', String(component.productId)));
  if (!productionSnapshot.exists()) throw new Error('The underlying production product was not found.');

  const selectedSellingOption = resolvePlanSellingOption(product as Record<string, unknown>, plan as Record<string, unknown>);
  const frequency = str(plan.frequency).toLowerCase();
  const deliveriesPerTerm = Math.max(1, Math.floor(num(plan.deliveriesPerTerm, frequency === 'monthly' ? 4 : frequency === 'quarterly' ? 12 : 1)));
  const deliveryDates = buildSubscriptionDeliveryDates(startDate, deliveriesPerTerm);
  const deliveryCharges = await calculateUniqueDateCheckoutDeliveryCharges({
    pincode: String(address.pincode ?? ''),
    subscriptionDates: deliveryDates,
  });
  const firstDeliveryDate = deliveryDates[0] || startDate;
  const lastDeliveryDate = deliveryDates[deliveryDates.length - 1] || startDate;
  const requestedGrams = num(component.quantityGrams) * quantity;

  if (!Number.isFinite(selectedSellingOption.price) || selectedSellingOption.price < 0) {
    throw new Error('Invalid subscription price configuration.');
  }

  const paymentAttemptId = `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const subscriptionRef = doc(collection(db, 'subscriptions'));
  const orderRef = doc(collection(db, 'orders'));
  const subscriptionId = subscriptionRef.id;
  const subscription = stripUndefined({
    subscriptionNumber: subscriptionNumber(subscriptionId),
    customerId: mobile,
    customerName: str(customer.name),
    customerMobile: str(customer.mobileNumber || customer.mobile || mobile, mobile),
    salableProductId: productId,
    productId: String(component.productId),
    productName: str(productionSnapshot.data()?.name, str(product.name)),
    sellingOptionId: selectedSellingOption.sellingOptionId || selectedSellingOption.id || '',
    sellingOptionLabel: selectedSellingOption.sellingOptionLabel || moneyLabel(Number(selectedSellingOption.weightGrams ?? component.quantityGrams ?? 0)),
    weightGrams: Number(selectedSellingOption.weightGrams ?? component.quantityGrams ?? 0),
    unitPrice: selectedSellingOption.price,
    quantity,
    frequency,
    totalDeliveries: deliveriesPerTerm,
    deliveriesGenerated: 0,
    remainingDeliveries: deliveriesPerTerm,
    nextDeliveryDate: firstDeliveryDate,
    deliveryDay: 6,
    startDate: firstDeliveryDate,
    endDate: lastDeliveryDate,
    deliveryAddress: address,
    deliveryFeePerDelivery: deliveryCharges.chargePerDate,
    deliveryChargeDetails: { dates: deliveryDates, charges: deliveryCharges.charges },
    requiresCustomerContact: input.shortageDecision === 'contact',
    availabilityRequestedGrams: requestedGrams,
    availabilityAvailableGrams: requestedGrams,
    availabilityShortageGrams: 0,
    carryForwardQuantityGrams: 0,
    availabilityDecision: input.shortageDecision || 'continue',
    status: 'pending_payment',
    createdAt: serverTimestamp(),
    paymentAttemptId,
    authUid: sessionUid,
    updatedAt: serverTimestamp(),
  });

  const order = stripUndefined({
    authUid: sessionUid,
    orderNumber: orderNumber(),
    customerId: mobile,
    customerName: str(customer.name),
    customerMobile: str(customer.mobileNumber || customer.mobile || mobile, mobile),
    items: [{
      salableProductId: productId,
      salableProductType: product.type === 'multiple' ? 'multiple' : 'single',
      productId: String(component.productId),
      productName: str(productionSnapshot.data()?.name, str(product.name)),
      sellingOptionId: selectedSellingOption.sellingOptionId || selectedSellingOption.id || '',
      sellingOptionLabel: selectedSellingOption.sellingOptionLabel || moneyLabel(Number(selectedSellingOption.weightGrams ?? component.quantityGrams ?? 0)),
      weightGrams: Number(selectedSellingOption.weightGrams ?? component.quantityGrams ?? 0),
      quantity,
      unitPrice: selectedSellingOption.price,
      lineTotal: selectedSellingOption.price * quantity,
      imageUrl: str(product.imageUrl),
    }],
    subtotal: selectedSellingOption.price * quantity,
    deliveryFee: deliveryCharges.total,
    discount: 0,
    total: selectedSellingOption.price * quantity + deliveryCharges.total,
    currency: 'INR',
    paymentStatus: 'pending',
    paymentMethod: 'online',
    status: 'pending_payment',
    deliveryAddress: address,
    scheduledDeliveryDate: firstDeliveryDate,
    deliveryDate: firstDeliveryDate,
    notes: '',
    orderType: 'subscription',
    subscriptionId,
    subscriptionNumber: subscription.subscriptionNumber,
    subscriptionPlanId: planId,
    subscriptionPlanName: str(plan.name, frequency),
    subscriptionFrequency: frequency,
    paymentAttemptId,
    deliveryChargeId: deliveryCharges.charges[0]?.sourceId || '',
    deliveryChargeName: deliveryCharges.charges[0]?.sourceName || '',
    deliveryChargeSnapshot: deliveryCharges.total,
    deliveryChargeDetails: { dates: deliveryDates, charges: deliveryCharges.charges },
    packingStatus: 'pending',
    requiresCustomerContact: input.shortageDecision === 'contact',
    availabilityRequestedGrams: requestedGrams,
    availabilityAvailableGrams: requestedGrams,
    availabilityShortageGrams: 0,
    carryForwardQuantityGrams: 0,
    availabilityDecision: input.shortageDecision || 'continue',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const batch = writeBatch(db);
  batch.set(subscriptionRef, subscription);
  batch.set(orderRef, order);
  await batch.commit();

  return {
    subscriptionId: subscriptionRef.id,
    subscriptionNumber: subscription.subscriptionNumber,
    orderId: orderRef.id,
    orderNumber: order.orderNumber,
    paymentAttemptId,
    sellingOptionId: selectedSellingOption.sellingOptionId || selectedSellingOption.id || '',
    total: Number(order.total ?? 0),
  };
}

export async function updateCustomerSubscription(input: { mobile: string; subscriptionId: string; action: SubscriptionAction }) {
  const mobile = normalizeIndianMobile(input.mobile);
  const authUid = auth.currentUser?.uid;
  if (!mobile) throw new Error('Invalid customer mobile number.');
  if (!authUid) throw new Error('Your login session expired. Please sign in again.');
  if (!input.subscriptionId) throw new Error('Subscription is required.');

  const targetStatus: Record<SubscriptionAction, 'active' | 'paused' | 'cancelled'> = {
    pause: 'paused',
    resume: 'active',
    cancel: 'cancelled',
  };
  const nextStatus = targetStatus[input.action];
  if (!nextStatus) throw new Error('Unsupported subscription action.');

  const subscriptionRef = doc(db, 'subscriptions', input.subscriptionId);
  const snapshot = await getDoc(subscriptionRef);
  if (!snapshot.exists()) throw new Error('Subscription not found.');
  const subscription = snapshot.data() || {};

  if (String(subscription.customerId ?? '') !== mobile || String(subscription.authUid ?? '') !== authUid) {
    throw new Error('Subscription does not belong to the signed-in customer.');
  }
  if (String(subscription.paymentStatus ?? '') !== 'paid' || String(subscription.status ?? '') === 'pending_payment') {
    throw new Error('This subscription is not active for lifecycle changes.');
  }

  const currentStatus = String(subscription.status ?? '').toLowerCase();
  if (currentStatus === 'completed' || currentStatus === 'cancelled') {
    throw new Error('This subscription can no longer be changed.');
  }
  if (input.action === 'pause' && currentStatus !== 'active') {
    throw new Error('Only an active subscription can be paused.');
  }
  if (input.action === 'resume' && currentStatus !== 'paused') {
    throw new Error('Only a paused subscription can be resumed.');
  }
  if (input.action === 'cancel' && !['active', 'paused'].includes(currentStatus)) {
    throw new Error('Only an active or paused subscription can be cancelled.');
  }

  await updateDoc(subscriptionRef, {
    status: nextStatus,
    updatedAt: serverTimestamp(),
  });
  return { id: input.subscriptionId, status: nextStatus };
}
