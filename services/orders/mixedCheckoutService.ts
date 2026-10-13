import { collection, doc, getDoc, getDocs, query, serverTimestamp, where, writeBatch } from '../core/firestore';
import { auth, db } from '../core/firebaseClient';
import { normalizeIndianMobile } from '../clientOnboarding';
import { stripUndefined } from '../core/firestoreData';
import { checkProductAvailability, nextWeekSaturday } from './customerOrderAvailability';
import { buildSubscriptionDeliveryDates, calculateUniqueDateCheckoutDeliveryCharges } from './deliveryChargeService';
import type { CustomerAddress } from '../customerAddresses';
import type { CartItem, SubscriptionCartItem } from '../cart/cartService';
import type { Product } from '../products/productService';
import { allocateOfferSavings, calculateCheckoutPayableTotal, calculateCustomerOffers } from './customerOffers';
import { parseWeightGrams } from './weightUtils';
import { checkoutDocumentId, checkoutOrderNumber, checkoutSubscriptionNumber } from './checkoutAttemptUtils';
import { getSubscriptionPlanPriceForSellingOption, getSubscriptionPlanSellingOption } from '../subscriptions/subscriptionPlanPrice';

const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const mobileOf = (value: unknown) => normalizeIndianMobile(String(value ?? ''));
const number = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export type MixedCheckoutInput = {
  mobile: string;
  addressId: string;
  deliverySlot: string;
  paymentAttemptId?: string;
  checkoutFingerprint: string;
  paymentMethod?: string;
  oneTimeItems: CartItem[];
  subscriptionItems: SubscriptionCartItem[];
  shortageDecision?: 'continue' | 'contact';
};

export type MixedCheckoutResult = {
  oneTimeOrderId: string;
  oneTimeOrderIds: string[];
  oneTimeOrderNumber: string;
  oneTimeOrderNumbers: string[];
  subscriptionOrderIds: string[];
  subscriptionNumbers: string[];
  paymentOrderIds: string[];
  total: number;
  primaryOrderId: string;
  primaryOrderNumber: string;
  paymentAttemptId: string;
  cashfreeOrderId?: string;
};

type CheckoutOrderRecord = { id: string; data: Record<string, unknown> };

function resultFromOrders(paymentAttemptId: string, records: CheckoutOrderRecord[]): MixedCheckoutResult {
  const orderedRecords = [...records].sort((left, right) => {
    const leftSubscription = String(left.data.orderType ?? '') === 'subscription';
    const rightSubscription = String(right.data.orderType ?? '') === 'subscription';
    if (leftSubscription !== rightSubscription) return leftSubscription ? 1 : -1;
    return String(left.data.scheduledDeliveryDate ?? '').localeCompare(String(right.data.scheduledDeliveryDate ?? ''))
      || String(left.data.orderNumber ?? '').localeCompare(String(right.data.orderNumber ?? ''));
  });
  const cashfreeOrderIds = [...new Set(orderedRecords.map((item) => clean(item.data.cashfreeOrderId)).filter(Boolean))];
  if (cashfreeOrderIds.length > 1) {
    throw new Error('This checkout is linked to multiple payment attempts. Please contact support before retrying.');
  }

  const subscriptionOrders = orderedRecords.filter((item) => String(item.data.orderType ?? '') === 'subscription');
  const oneTimeOrders = orderedRecords.filter((item) => String(item.data.orderType ?? '') !== 'subscription');
  const oneTime = oneTimeOrders[0];
  const total = orderedRecords.reduce((sum, item) => sum + number(item.data.total), 0);
  return {
    oneTimeOrderId: oneTime?.id || '',
    oneTimeOrderIds: oneTimeOrders.map((item) => item.id),
    oneTimeOrderNumber: String(oneTime?.data.orderNumber ?? ''),
    oneTimeOrderNumbers: oneTimeOrders.map((item) => String(item.data.orderNumber ?? '')),
    subscriptionOrderIds: subscriptionOrders.map((item) => item.id),
    subscriptionNumbers: subscriptionOrders.map((item) => String(item.data.subscriptionNumber ?? '')),
    paymentOrderIds: orderedRecords.map((item) => item.id),
    total,
    primaryOrderId: oneTime?.id || subscriptionOrders[0]?.id || '',
    primaryOrderNumber: String(oneTime?.data.orderNumber ?? subscriptionOrders[0]?.data.orderNumber ?? ''),
    paymentAttemptId,
    ...(cashfreeOrderIds[0] ? { cashfreeOrderId: cashfreeOrderIds[0] } : {}),
  };
}

async function recoverCheckoutAttempt(
  authUid: string,
  mobile: string,
  paymentAttemptId: string,
  checkoutFingerprint: string,
  expectedOrderCount: number,
  expectedSubscriptionCount: number,
): Promise<MixedCheckoutResult | null> {
  const snapshot = await getDocs(query(
    collection(db, 'orders'),
    where('authUid', '==', authUid),
    where('paymentAttemptId', '==', paymentAttemptId),
  ));
  if (!snapshot.docs.length) return null;
  if (snapshot.docs.some((item) => {
    const data = item.data() || {};
    return data.authUid !== authUid
      || mobileOf(data.customerId) !== mobile
      || data.paymentAttemptId !== paymentAttemptId
      || data.checkoutFingerprint !== checkoutFingerprint;
  })) {
    throw new Error('Checkout attempt records do not match this customer or cart. No payment was started.');
  }
  const records = snapshot.docs.map((item) => ({ id: item.id, data: item.data() as Record<string, unknown> }));
  if (records.length !== expectedOrderCount) {
    throw new Error('This checkout attempt has incomplete order records. No payment was started.');
  }
  const subscriptionOrders = records.filter((item) => String(item.data.orderType ?? '') === 'subscription');
  if (subscriptionOrders.length !== expectedSubscriptionCount) {
    throw new Error('This checkout attempt has incomplete subscription records. No payment was started.');
  }
  const linkedSubscriptions = await Promise.all(subscriptionOrders.map(async (item) => {
    const subscriptionId = clean(item.data.subscriptionId);
    return subscriptionId ? getDoc(doc(db, 'subscriptions', subscriptionId)) : null;
  }));
  if (linkedSubscriptions.some((item) => {
    if (!item?.exists()) return true;
    const data = item.data() || {};
    return data.authUid !== authUid
      || mobileOf(data.customerId) !== mobile
      || data.paymentAttemptId !== paymentAttemptId
      || data.checkoutFingerprint !== checkoutFingerprint;
  })) {
    throw new Error('This subscription checkout is incomplete and cannot be sent for payment. Please contact support.');
  }
  return resultFromOrders(paymentAttemptId, records);
}

function formatWeightLabel(grams: number) {
  return grams >= 1000 && grams % 1000 === 0 ? `${grams / 1000}kg box` : `${grams}g box`;
}

function activeSellingOptions(product: Record<string, unknown>) {
  return Array.isArray(product.sellingOptions)
    ? product.sellingOptions.map((raw) => raw as Record<string, unknown>).filter((option) => option.active !== false && number(option.weightGrams) > 0)
    : [];
}

function findSellingOption(product: Record<string, unknown>, item: Pick<CartItem, 'selectedWeight' | 'sellingOptionId'>) {
  const options = activeSellingOptions(product);
  const selectedWeight = parseWeightGrams(item.selectedWeight, 0);
  return options.find((option) => clean(option.id) && clean(option.id) === clean(item.sellingOptionId))
    ?? options.find((option) => selectedWeight > 0 && number(option.weightGrams) === selectedWeight)
    ?? undefined;
}

function productOrderItem(product: Record<string, unknown> & { id: string }, item: CartItem, deliveryDate: string) {
  const components = Array.isArray(product.components) ? product.components : [];
  const selectedOption = findSellingOption(product, item);
  const selectedWeight = parseWeightGrams(item.selectedWeight, number(selectedOption?.weightGrams));
  const packagingGrams = selectedWeight > 0 ? selectedWeight : components.reduce((sum, raw) => {
    const component = (raw ?? {}) as Record<string, unknown>;
    return sum + Math.max(0, number(component.quantityGrams));
  }, 0);
  const quantity = Math.max(1, Math.floor(number(item.quantity, 1)));
  const weightGrams = Math.max(0, packagingGrams * quantity);
  const price = number(selectedOption?.price, number(item.price, number(product.sellingPrice)));
  const mrp = number(selectedOption?.mrp, number(item.mrp, number(product.mrp, price)));
  return {
    salableProductId: product.id,
    salableProductSku: clean(product.sku),
    salableProductType: product.type === 'multiple' ? 'multiple' : 'single',
    productId: product.id,
    productName: clean(product.name) || item.name,
    productSlug: clean(product.slug),
    sellingOptionId: clean(selectedOption?.id) || clean(item.sellingOptionId),
    sellingOptionLabel: item.sellingOptionLabel || formatWeightLabel(packagingGrams),
    packaging: packagingGrams,
    weightGrams,
    quantity,
    mrp,
    unitPrice: price,
    lineTotal: price * quantity,
    deliveryDate,
    imageUrl: clean(product.imageUrl),
  };
}

export function groupOneTimeOrderItemsByDeliveryDate<T extends { deliveryDate?: string }>(items: T[], fallbackDate: string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const date = clean(item.deliveryDate) || fallbackDate;
    const group = groups.get(date) || [];
    group.push(item);
    groups.set(date, group);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
}

export async function createCustomerMixedCheckout(input: MixedCheckoutInput): Promise<MixedCheckoutResult> {
  const mobile = mobileOf(input.mobile);
  const authUid = auth.currentUser?.uid;
  if (!authUid) throw new Error('Your login session expired. Please sign in again.');
  if (mobile.length !== 10) throw new Error('Invalid customer mobile number.');

  const paymentAttemptId = clean(input.paymentAttemptId) || `pay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const expectedOneTimeOrders = groupOneTimeOrderItemsByDeliveryDate(
    input.oneTimeItems.map((item) => ({ deliveryDate: clean(item.deliveryDate) || nextWeekSaturday() })),
    nextWeekSaturday(),
  ).length;
  const expectedOrderCount = expectedOneTimeOrders + input.subscriptionItems.length;
  const existingAttempt = await recoverCheckoutAttempt(
    authUid,
    mobile,
    paymentAttemptId,
    input.checkoutFingerprint,
    expectedOrderCount,
    input.subscriptionItems.length,
  );
  if (existingAttempt) return existingAttempt;

  if (!clean(input.addressId)) throw new Error('Delivery address is required.');
  if (!clean(input.deliverySlot)) throw new Error('Delivery slot/date is required.');
  if (!input.oneTimeItems.length && !input.subscriptionItems.length) throw new Error('Cart is empty.');

  const customerRef = doc(db, 'customers', mobile);
  const customerSnap = await getDoc(customerRef);
  if (!customerSnap.exists()) throw new Error('Customer account not found.');
  const customer = customerSnap.data() || {};
  if (customer.status === 'blocked') throw new Error('This customer account is blocked.');

  const addresses = Array.isArray(customer.addresses) ? customer.addresses : [];
  const address = addresses.find((raw) => String((raw as Record<string, unknown>)?.id ?? '') === input.addressId) as CustomerAddress | undefined;
  if (!address) throw new Error('Selected delivery address was not found.');

  const allIds = [...new Set([...input.oneTimeItems.map((item) => clean(item.id)), ...input.subscriptionItems.map((item) => clean(item.id))])];
  const productSnapshots = await Promise.all(allIds.map((id) => getDoc(doc(db, 'salesProducts', id))));
  const productById = new Map(allIds.map((id, index) => [id, productSnapshots[index]]));

  const plansSnapshot = await getDocs(query(collection(db, 'subscriptionPlans'), where('active', '==', true)));
  const planById = new Map<string, Record<string, unknown>>(plansSnapshot.docs.map((item) => [item.id, item.data() as Record<string, unknown>]));

  const targetDate = nextWeekSaturday();

  const resolvedOneTimeDates = input.oneTimeItems.map((item) => clean(item.deliveryDate) || targetDate);
  const resolvedSubscriptionDates = input.subscriptionItems.flatMap((item) =>
    buildSubscriptionDeliveryDates(clean(item.deliveryDate) || clean(item.startDate) || targetDate, Number(item.deliveriesPerTerm) || 1),
  );
  const deliveryCharges = await calculateUniqueDateCheckoutDeliveryCharges({
    pincode: String(address.pincode ?? ''),
    oneTimeDates: resolvedOneTimeDates,
    subscriptionDates: resolvedSubscriptionDates,
  });
  const uniqueDates = deliveryCharges.dates;
  const firstDeliveryDate = resolvedOneTimeDates[0] || resolvedSubscriptionDates[0] || targetDate;
  const deliveryChargeForDate = new Map(deliveryCharges.charges.map((item) => [item.deliveryDate, item]));
  const oneTimeDeliveryChargeByDate = new Map<string, number>();
  let oneSubtotal = 0;
  let oneMrpSubtotal = 0;
  const oneOrderItems: Array<Record<string, unknown> & { deliveryDate: string }> = [];
  const subscriptionWrites: Array<{ subscriptionRef: ReturnType<typeof doc>; subscription: Record<string, unknown>; orderRef: ReturnType<typeof doc>; order: Record<string, unknown> }> = [];
  const availabilityResults: Array<{ hasShortage: boolean; requestedGrams: number; availableGrams: number; shortageGrams: number }> = [];
  const assignedDeliveryDates = new Set<string>();
  for (const date of resolvedOneTimeDates) {
    if (oneTimeDeliveryChargeByDate.has(date)) continue;
    oneTimeDeliveryChargeByDate.set(date, Number(deliveryChargeForDate.get(date)?.charge ?? 0));
    assignedDeliveryDates.add(date);
  }

  for (const item of input.oneTimeItems) {
    const snap = productById.get(item.id);
    if (!snap?.exists()) throw new Error(`Product "${item.name}" is no longer available.`);
    const product = snap.data() || {};
    if (product.active !== true) throw new Error(`Product "${clean(product.name) || item.name}" is no longer available.`);
    const quantity = number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Item quantities must be at least 1.');
    const selectedOption = findSellingOption(product, item);
    const price = number(selectedOption?.price, number(item.price, number(product.sellingPrice)));
    const mrp = number(selectedOption?.mrp, number(item.mrp, price));
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(mrp) || mrp < price) throw new Error(`Invalid price for "${clean(product.name) || item.name}".`);

    const deliveryDate = clean(item.deliveryDate) || targetDate;
    const packagingGrams = parseWeightGrams(item.selectedWeight, number(selectedOption?.weightGrams));
    const availability = await checkProductAvailability({ product: { ...(product as Product), id: snap.id } as Product, quantity, packagingGrams, deliveryDate });
    availabilityResults.push(availability);
    const orderItem = productOrderItem({ ...product, id: snap.id }, item, deliveryDate);
    oneOrderItems.push(orderItem);
    oneSubtotal += number(orderItem.lineTotal);
    oneMrpSubtotal += number(orderItem.mrp) * number(orderItem.quantity);
  }

  for (const [subscriptionIndex, item] of input.subscriptionItems.entries()) {
    const snap = productById.get(item.id);
    if (!snap?.exists()) throw new Error(`Product "${item.name}" is no longer available.`);
    const product = snap.data() || {};
    if (product.active !== true) throw new Error(`Product "${clean(product.name) || item.name}" is no longer available.`);
    const quantity = number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Subscription quantities must be at least 1.');

    const plan = planById.get(item.planId);
    if (!plan || plan.active !== true) throw new Error(`Subscription plan "${item.planName}" is no longer active.`);
    if (clean(plan.salableProductId) !== String(item.id).trim()) throw new Error(`Subscription plan "${item.planName}" does not belong to the selected product.`);
    const frequency = clean(plan.frequency).toLowerCase();
    if (!['monthly', 'quarterly', 'half_yearly', 'yearly'].includes(frequency)) throw new Error('Selected subscription plan is invalid.');
    const planOptions = Array.isArray(plan.sellingOptions)
      ? plan.sellingOptions.flatMap((raw) => {
          if (!raw || typeof raw !== 'object') return [];
          const option = raw as Record<string, unknown>;
          return [{
            ...(option.id != null ? { id: clean(option.id) } : {}),
            ...(option.sellingOptionId != null ? { sellingOptionId: clean(option.sellingOptionId) } : {}),
            ...(option.sellingOptionLabel != null ? { sellingOptionLabel: clean(option.sellingOptionLabel) } : {}),
            weightGrams: number(option.weightGrams, Number.NaN),
            planPrice: number(option.planPrice, Number.NaN),
            ...(option.maximumPlanPrice != null ? { maximumPlanPrice: number(option.maximumPlanPrice, Number.NaN) } : {}),
          }];
        })
      : [];
    const selectedWeight = parseWeightGrams(item.selectedWeight, 0);
    const selectedSellingOptionId = clean(item.sellingOptionId);
    const hasSelectedPackage = selectedWeight > 0 || Boolean(selectedSellingOptionId);
    const planForPrice = { price: number(plan.price, Number.NaN), sellingOptions: planOptions };
    const sellingOption = getSubscriptionPlanSellingOption(planForPrice, selectedSellingOptionId, selectedWeight || undefined);
    const price = hasSelectedPackage
      ? sellingOption?.planPrice
      : getSubscriptionPlanPriceForSellingOption(planForPrice);
    if (price === undefined || !Number.isFinite(price) || price < 0) {
      throw new Error(`No valid subscription price is configured for the selected package of "${clean(product.name) || item.name}".`);
    }

    const components = Array.isArray(product.components) ? product.components : [];
    if (!components.length || components.some((component) => !(component as Record<string, unknown>)?.productId)) throw new Error(`Product "${clean(product.name) || item.name}" has no production product component.`);
    const packaging = selectedWeight > 0 ? selectedWeight : number(sellingOption?.weightGrams, components.reduce((sum, raw) => sum + number((raw as Record<string, unknown>).quantityGrams), 0));
    const weight = packaging * quantity;
    if (!Number.isFinite(weight) || weight <= 0) throw new Error(`Product "${clean(product.name) || item.name}" has an invalid pack quantity.`);

    const deliveries = Math.max(1, number(plan.deliveriesPerTerm, frequency === 'monthly' ? 4 : frequency === 'quarterly' ? 12 : 1));
    const first = clean(item.deliveryDate) || clean(item.startDate) || targetDate;
    const subscriptionDates = buildSubscriptionDeliveryDates(first, deliveries);
    const endDate = subscriptionDates[subscriptionDates.length - 1] || first;
    const availability = await checkProductAvailability({ product: { ...(product as Product), id: snap.id } as Product, quantity, packagingGrams: packaging, deliveryDate: first });
    availabilityResults.push(availability);

    const chargeableSubscriptionDates = subscriptionDates.filter((date) => !assignedDeliveryDates.has(date));
    const deliveryFee = chargeableSubscriptionDates.reduce((sum, date) => sum + Number(deliveryChargeForDate.get(date)?.charge ?? 0), 0);
    for (const date of subscriptionDates) assignedDeliveryDates.add(date);
    const firstSubscriptionDate = first;
    const charge = deliveryChargeForDate.get(firstSubscriptionDate);
    const label = item.sellingOptionLabel || formatWeightLabel(packaging);
    const sellingOptionId = clean(sellingOption?.sellingOptionId) || clean(sellingOption?.id) || clean(item.sellingOptionId);
    const subscriptionRef = doc(db, 'subscriptions', checkoutDocumentId(paymentAttemptId, 'subscription', String(subscriptionIndex)));
    const orderRef = doc(db, 'orders', checkoutDocumentId(paymentAttemptId, 'subscription_order', String(subscriptionIndex)));
    const subscriptionNumber = checkoutSubscriptionNumber(paymentAttemptId, subscriptionIndex);
    const subscriptionOrderNumber = checkoutOrderNumber(paymentAttemptId, input.oneTimeItems.length + subscriptionIndex);
    const customerName = clean(customer.name) || 'Unnamed customer';
    const customerMobile = clean(customer.mobileNumber || customer.mobile || mobile);
    const decision = input.shortageDecision || 'continue';

    const subscription = stripUndefined({
      authUid,
      subscriptionNumber,
      customerId: mobile,
      customerName,
      customerMobile: mobile,
      salableProductId: snap.id,
      productId: snap.id,
      productName: clean(product.name),
      sellingOptionId,
      sellingOptionLabel: label,
      packaging,
      weightGrams: weight,
      unitPrice: price,
      quantity,
      frequency,
      totalDeliveries: deliveries,
      deliveriesGenerated: 0,
      nextDeliveryDate: first,
      deliveryDay: 6,
      startDate: first,
      endDate,
      deliveryAddress: address,
      deliveryFeePerDelivery: deliveryFee,
      deliveryChargeDetails: { dates: subscriptionDates, charges: subscriptionDates.map((date) => deliveryChargeForDate.get(date)).filter(Boolean) },
      requiresCustomerContact: false,
      availabilityRequestedGrams: availability.requestedGrams,
      availabilityAvailableGrams: availability.availableGrams,
      availabilityShortageGrams: availability.shortageGrams,
      carryForwardQuantityGrams: availability.shortageGrams,
      availabilityDecision: decision,
      status: 'pending_payment',
      paymentStatus: 'pending',
      createdAt: serverTimestamp(),
      paymentAttemptId,
      checkoutFingerprint: input.checkoutFingerprint,
      updatedAt: serverTimestamp(),
    });

    const subscriptionOrder = stripUndefined({
      authUid,
      orderNumber: subscriptionOrderNumber,
      customerId: mobile,
      customerName: clean(customer.name),
      customerMobile,
      items: [{
        salableProductId: snap.id,
        salableProductType: product.type === 'multiple' ? 'multiple' : 'single',
        productId: snap.id,
        productName: clean(product.name),
        sellingOptionId,
        sellingOptionLabel: label,
        packaging,
        weightGrams: weight,
        quantity,
        unitPrice: price,
        lineTotal: price * quantity,
        imageUrl: clean(product.imageUrl),
      }],
      subtotal: price * quantity,
      deliveryFee,
      discount: 0,
      total: price * quantity + deliveryFee,
      currency: 'INR',
      paymentStatus: 'pending',
      paymentMethod: clean(input.paymentMethod) || 'online',
      status: 'pending_payment',
      deliveryAddress: address,
      scheduledDeliveryDate: first,
      deliveryDate: first,
      notes: '',
      orderType: 'subscription',
      subscriptionId: subscriptionRef.id,
      subscriptionNumber,
      subscriptionPlanId: item.planId,
      subscriptionPlanName: clean(plan.name) || frequency,
      subscriptionFrequency: frequency,
      paymentAttemptId,
      checkoutFingerprint: input.checkoutFingerprint,
      deliveryChargeId: charge?.sourceId || '',
      deliveryChargeName: charge?.sourceName || '',
      deliveryChargeSnapshot: deliveryFee,
      deliveryChargeDetails: { dates: subscriptionDates, charges: subscriptionDates.map((date) => deliveryChargeForDate.get(date)).filter(Boolean) },
      packingStatus: 'pending',
      requiresCustomerContact: false,
      availabilityRequestedGrams: availability.requestedGrams,
      availabilityAvailableGrams: availability.availableGrams,
      availabilityShortageGrams: availability.shortageGrams,
      carryForwardQuantityGrams: availability.shortageGrams,
      availabilityDecision: decision,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    subscriptionWrites.push({ subscriptionRef, subscription, orderRef, order: subscriptionOrder });
  }

  if (availabilityResults.some((result) => result.hasShortage)) throw new Error('HARVEST_SHORTAGE_CONFIRMATION_REQUIRED');

  const geo = deliveryCharges.charges[0];
  const offerResult = (input.oneTimeItems.length || input.subscriptionItems.length)
    ? await calculateCustomerOffers({
        pincode: String(address.pincode ?? ''),
        geoId: geo?.sourceId ?? '',
        locationName: geo?.sourceName ?? '',
        oneTimeSubtotal: oneSubtotal,
        subscriptionSubtotal: subscriptionWrites.reduce((sum, item) => sum + number(item.order.subtotal), 0),
        deliveryChargeAmounts: deliveryCharges.charges.map((charge) => charge.charge),
        subscriptions: input.subscriptionItems.map((item) => {
          const plan = planById.get(item.planId) || {};
          const frequency = clean(plan.frequency).toLowerCase();
          return {
            frequency,
            regularDeliveries: number(plan.deliveriesPerTerm, frequency === 'monthly' ? 4 : frequency === 'quarterly' ? 12 : 1),
            pincode: String(address.pincode ?? ''),
            geoId: geo?.sourceId ?? '',
            locationName: geo?.sourceName ?? '',
          };
        }),
      })
    : {
        priceSavings: 0,
        oneTimePriceSavings: 0,
        subscriptionPriceSavings: 0,
        deliverySavings: 0,
        totalSavings: 0,
        subscriptionEntitlements: [],
      };
  const subscriptionSubtotal = subscriptionWrites.reduce((sum, item) => sum + number(item.order.subtotal), 0);
  const expectedCheckoutTotal = calculateCheckoutPayableTotal(
    oneSubtotal + subscriptionSubtotal,
    deliveryCharges.total,
    offerResult,
  );
  let remainingDeliveryOfferSavings = Math.min(offerResult.deliverySavings, deliveryCharges.total);
  const allocateDeliveryOfferSaving = (deliveryFee: number) => {
    const saving = Math.min(Math.max(0, deliveryFee), remainingDeliveryOfferSavings);
    remainingDeliveryOfferSavings = Math.max(0, Math.round((remainingDeliveryOfferSavings - saving) * 100) / 100);
    return saving;
  };
  const oneOrderGroups = groupOneTimeOrderItemsByDeliveryDate(oneOrderItems, targetDate);
  const oneOrderDates = oneOrderGroups.map(([date]) => date);
  const oneTimeDeliverySavingsByDate = new Map<string, number>();
  for (const date of oneOrderDates) {
    oneTimeDeliverySavingsByDate.set(
      date,
      allocateDeliveryOfferSaving(oneTimeDeliveryChargeByDate.get(date) ?? 0),
    );
  }
  const oneTimeOfferSavings = Math.min(oneSubtotal, offerResult.oneTimePriceSavings);
  const subscriptionPriceAllocations = allocateOfferSavings(
    offerResult.subscriptionPriceSavings,
    subscriptionWrites.map((write) => number(write.order.subtotal)),
  );
  for (const [index, write] of subscriptionWrites.entries()) {
    const entitlement = offerResult.subscriptionEntitlements[index];
    if (!entitlement) throw new Error('Subscription delivery entitlement could not be calculated.');
    const deliveryDates = buildSubscriptionDeliveryDates(
      String(write.subscription.startDate ?? ''),
      entitlement.totalDeliveries,
    );
    write.subscription.totalDeliveries = entitlement.totalDeliveries;
    write.subscription.bonusDeliveries = entitlement.bonusDeliveries;
    write.subscription.subscriptionOfferId = entitlement.offer?.id || '';
    write.subscription.subscriptionOfferName = String(entitlement.offer?.name ?? '');
    write.subscription.endDate = deliveryDates[deliveryDates.length - 1] || write.subscription.startDate;
    write.order.totalDeliveries = entitlement.totalDeliveries;
    write.order.bonusDeliveries = entitlement.bonusDeliveries;
    write.order.subscriptionOfferId = entitlement.offer?.id || '';
    write.order.subscriptionOfferName = String(entitlement.offer?.name ?? '');
  }
  const oneTimePriceAllocations = allocateOfferSavings(
    oneTimeOfferSavings,
    oneOrderGroups.map(([, items]) => items.reduce((sum, item) => sum + number(item.lineTotal), 0)),
  );
  for (let index = 0; index < subscriptionWrites.length; index += 1) {
    const write = subscriptionWrites[index];
    const subtotal = number(write.order.subtotal);
    const allocated = subscriptionPriceAllocations[index] ?? 0;
    const originalDeliveryFee = number(write.order.deliveryFee);
    const deliverySaving = allocateDeliveryOfferSaving(originalDeliveryFee);
    const deliveryFee = Math.max(0, originalDeliveryFee - deliverySaving);
    write.order.discount = allocated;
    write.order.offerDiscount = allocated + deliverySaving;
    write.order.offerPriceSavings = allocated;
    write.order.offerDeliverySavings = deliverySaving;
    write.order.offerPriceName = offerResult.priceOffer?.name || '';
    write.order.offerDeliveryName = offerResult.deliveryOffer?.name || '';
    write.order.offerTotalSavings = allocated + deliverySaving;
    write.order.deliveryChargeOriginal = originalDeliveryFee;
    write.order.deliveryFee = deliveryFee;
    write.order.total = Math.max(0, subtotal - allocated) + deliveryFee;
  }
  const oneOrderWrites: Array<{ ref: ReturnType<typeof doc>; orderNumber: string; order: Record<string, unknown> }> = [];
  for (let index = 0; index < oneOrderDates.length; index += 1) {
    const date = oneOrderDates[index];
    const items = oneOrderGroups.find(([groupDate]) => groupDate === date)?.[1] || [];
    const groupSubtotal = items.reduce((sum, item) => sum + number(item.lineTotal), 0);
    const groupMrpSubtotal = items.reduce((sum, item) => sum + number(item.mrp, number(item.unitPrice)) * number(item.quantity), 0);
    const allocatedOffer = oneTimePriceAllocations[index] ?? 0;
    const groupDeliveryOriginal = oneTimeDeliveryChargeByDate.get(date) ?? 0;
    const groupDeliverySavings = oneTimeDeliverySavingsByDate.get(date) ?? 0;
    const groupDeliveryFee = Math.max(0, groupDeliveryOriginal - groupDeliverySavings);
    const groupProductSavings = Math.max(0, groupMrpSubtotal - groupSubtotal) + allocatedOffer;
    const oneOrderRef = doc(db, 'orders', checkoutDocumentId(paymentAttemptId, 'one_time_order', String(index)));
    const oneOrderNumber = checkoutOrderNumber(paymentAttemptId, index);
    oneOrderWrites.push({ ref: oneOrderRef, orderNumber: oneOrderNumber, order: stripUndefined({
      authUid,
      orderNumber: oneOrderNumber,
      customerId: mobile,
      customerName: clean(customer.name),
      customerMobile: clean(customer.mobileNumber || customer.mobile || mobile),
      items,
      subtotal: groupSubtotal,
      deliveryFee: groupDeliveryFee,
      discount: groupProductSavings,
      offerDiscount: allocatedOffer + groupDeliverySavings,
      offerPriceSavings: allocatedOffer,
      offerDeliverySavings: groupDeliverySavings,
      offerPriceName: offerResult.priceOffer?.name || '',
      offerDeliveryName: offerResult.deliveryOffer?.name || '',
      offerTotalSavings: allocatedOffer + groupDeliverySavings,
      deliveryChargeOriginal: groupDeliveryOriginal,
      total: Math.max(0, groupSubtotal - allocatedOffer) + groupDeliveryFee,
      currency: 'INR',
      paymentStatus: 'pending',
      paymentMethod: clean(input.paymentMethod) || 'online',
      status: 'pending_payment',
      deliveryAddress: address,
      scheduledDeliveryDate: date,
      deliveryDate: date,
      deliverySlot: input.deliverySlot.trim(),
      notes: '',
      orderType: 'one_time',
      subscriptionId: null,
      deliveryChargeId: deliveryChargeForDate.get(date)?.sourceId || '',
      deliveryChargeName: deliveryChargeForDate.get(date)?.sourceName || '',
      deliveryChargeSnapshot: groupDeliveryFee,
      deliveryChargeDetails: { dates: uniqueDates, charges: deliveryCharges.charges },
      packingStatus: 'pending',
      requiresCustomerContact: input.shortageDecision === 'contact',
      availabilityDecision: input.shortageDecision || 'continue',
      paymentAttemptId,
      checkoutFingerprint: input.checkoutFingerprint,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }) });
  }

  const persistedTotal = [
    ...oneOrderWrites.map((item) => number(item.order.total)),
    ...subscriptionWrites.map((item) => number(item.order.total)),
  ].reduce((sum, total) => sum + total, 0);
  if (Math.round((persistedTotal - expectedCheckoutTotal) * 100) !== 0) {
    throw new Error('Checkout order totals do not match the displayed product and delivery total. Please return to Cart and try again.');
  }

  const documents = [
    ...oneOrderWrites.map((item) => ({ ref: item.ref, data: item.order })),
    ...subscriptionWrites.flatMap((item) => [
      { ref: item.subscriptionRef, data: item.subscription },
      { ref: item.orderRef, data: item.order },
    ]),
  ];

  const batch = writeBatch(db);
  for (const item of documents) batch.set(item.ref, item.data, { merge: true });
  try {
    await batch.commit();
  } catch (writeError) {
    const recovered = await recoverCheckoutAttempt(
      authUid,
      mobile,
      paymentAttemptId,
      input.checkoutFingerprint,
      expectedOrderCount,
      input.subscriptionItems.length,
    );
    if (recovered) return recovered;
    throw writeError;
  }

  const recovered = await recoverCheckoutAttempt(
    authUid,
    mobile,
    paymentAttemptId,
    input.checkoutFingerprint,
    expectedOrderCount,
    input.subscriptionItems.length,
  );
  if (!recovered) {
    throw new Error('Checkout records could not be confirmed after creation. Retry this same checkout before paying.');
  }
  return recovered;
}

export async function assertPaymentAttemptOwnership(attempt: {
  orderIds: string[];
  paymentAttemptId: string;
  checkoutFingerprint?: string;
}, mobile: string) {
  const authUid = auth.currentUser?.uid;
  if (!authUid) throw new Error('Your login session expired. Please sign in again.');
  const customerMobile = mobileOf(mobile);
  if (!attempt.orderIds.length) throw new Error('No pending order was found for this payment attempt.');
  const snapshots = await Promise.all(attempt.orderIds.map((id) => getDoc(doc(db, 'orders', id))));
  for (const snapshot of snapshots) {
    if (!snapshot.exists()) throw new Error('A pending order for this payment attempt could not be found.');
    const data = snapshot.data() || {};
    if (data.authUid !== authUid || mobileOf(data.customerId) !== customerMobile) {
      throw new Error('The pending order does not belong to the signed-in customer session. Sign in to the account used for this checkout.');
    }
    if (attempt.checkoutFingerprint && (
      data.paymentAttemptId !== attempt.paymentAttemptId
      || data.checkoutFingerprint !== attempt.checkoutFingerprint
    )) {
      throw new Error('The pending order does not match this checkout attempt. No payment was started.');
    }
  }
}
