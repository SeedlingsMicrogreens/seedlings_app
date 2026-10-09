import { collection, doc, getDoc, getDocs, query, serverTimestamp, where, writeBatch } from '../core/firestore';
import { auth, db } from '../core/firebaseClient';
import { normalizeIndianMobile } from '../clientOnboarding';
import { stripUndefined } from '../core/firestoreData';
import { checkProductAvailability, nextWeekSaturday } from './customerOrderAvailability';
import { buildSubscriptionDeliveryDates, calculateUniqueDateCheckoutDeliveryCharges } from './deliveryChargeService';
import type { CustomerAddress } from '../customerAddresses';
import type { CartItem, SubscriptionCartItem } from '../cart/cartService';
import type { Product } from '../products/productService';
import { calculateCustomerOffers } from './customerOffers';
import { parseWeightGrams } from './weightUtils';

const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const mobileOf = (value: unknown) => normalizeIndianMobile(String(value ?? ''));
const orderNumber = () => `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const number = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export type MixedCheckoutInput = {
  mobile: string;
  addressId: string;
  deliverySlot: string;
  paymentAttemptId?: string;
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
};

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
  const paymentAttemptId = clean(input.paymentAttemptId) || `pay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  const existingAttempt = await getDocs(query(collection(db, 'orders'), where('authUid', '==', authUid), where('paymentAttemptId', '==', paymentAttemptId)));
  const existingOrders = existingAttempt.docs.filter((item) => String(item.data()?.customerId ?? '') === mobile);
  if (existingOrders.length) {
    const subscriptionOrders = existingOrders.filter((item) => String(item.data()?.orderType ?? '') === 'subscription');
    const oneTimeOrders = existingOrders.filter((item) => String(item.data()?.orderType ?? '') !== 'subscription');
    const oneTime = oneTimeOrders[0];
    const total = existingOrders.reduce((sum, item) => sum + number(item.data()?.total), 0);
    return {
      oneTimeOrderId: oneTime?.id || '',
      oneTimeOrderIds: oneTimeOrders.map((item) => item.id),
      oneTimeOrderNumber: String(oneTime?.data()?.orderNumber ?? ''),
      oneTimeOrderNumbers: oneTimeOrders.map((item) => String(item.data()?.orderNumber ?? '')),
      subscriptionOrderIds: subscriptionOrders.map((item) => item.id),
      subscriptionNumbers: subscriptionOrders.map((item) => String(item.data()?.subscriptionNumber ?? '')),
      paymentOrderIds: existingOrders.map((item) => item.id),
      total,
      primaryOrderId: oneTime?.id || subscriptionOrders[0]?.id || '',
      primaryOrderNumber: String(oneTime?.data()?.orderNumber ?? subscriptionOrders[0]?.data()?.orderNumber ?? ''),
      paymentAttemptId,
    };
  }

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
  let oneSubtotal = 0;
  let oneMrpSubtotal = 0;
  const oneOrderItems: Array<Record<string, unknown> & { deliveryDate: string }> = [];
  const subscriptionWrites: Array<{ subscriptionRef: ReturnType<typeof doc>; subscription: Record<string, unknown>; orderRef: ReturnType<typeof doc>; order: Record<string, unknown> }> = [];
  const availabilityResults: Array<{ hasShortage: boolean; requestedGrams: number; availableGrams: number; shortageGrams: number }> = [];
  const assignedDeliveryDates = new Set<string>();
  const oneDeliveryDates = new Set<string>();
  const oneDeliveryFee = resolvedOneTimeDates.reduce((sum, date) => {
    if (oneDeliveryDates.has(date)) return sum;
    oneDeliveryDates.add(date);
    assignedDeliveryDates.add(date);
    return sum + Number(deliveryChargeForDate.get(date)?.charge ?? 0);
  }, 0);

  for (const item of input.oneTimeItems) {
    const snap = productById.get(item.id);
    if (!snap?.exists()) throw new Error(`Product "${item.name}" is no longer available.`);
    const product = snap.data() || {};
    if (product.active !== true || product.oneTimePurchase !== true) throw new Error(`Product "${clean(product.name) || item.name}" is not available for one-time purchase.`);
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

  for (const item of input.subscriptionItems) {
    const snap = productById.get(item.id);
    if (!snap?.exists()) throw new Error(`Product "${item.name}" is no longer available.`);
    const product = snap.data() || {};
    if (product.active !== true) throw new Error(`Product "${clean(product.name) || item.name}" is no longer available.`);
    const quantity = number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Subscription quantities must be at least 1.');

    const plan = planById.get(item.planId);
    if (!plan || plan.active !== true) throw new Error(`Subscription plan "${item.planName}" is no longer active.`);
    if (plan.salableProductId != null && String(plan.salableProductId) !== String(item.id)) throw new Error(`Subscription plan "${item.planName}" does not belong to the selected product.`);
    const frequency = clean(plan.frequency).toLowerCase();
    if (!['monthly', 'quarterly', 'half_yearly', 'yearly'].includes(frequency)) throw new Error('Selected subscription plan is invalid.');
    const sellingOption = Array.isArray(plan.sellingOptions)
      ? (plan.sellingOptions as unknown[]).map((raw) => raw as Record<string, unknown>).find((raw) => String(raw.sellingOptionId ?? raw.id ?? '') === String(item.sellingOptionId ?? ''))
      : undefined;
    const price = number(sellingOption?.planPrice, number(plan.price, number(product.sellingPrice)));
    if (!Number.isFinite(price) || price < 0) throw new Error(`Invalid subscription price for "${clean(product.name) || item.name}".`);

    const components = Array.isArray(product.components) ? product.components : [];
    if (!components.length || components.some((component) => !(component as Record<string, unknown>)?.productId)) throw new Error(`Product "${clean(product.name) || item.name}" has no production product component.`);
    const selectedWeight = parseWeightGrams(item.selectedWeight, 0);
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
    const subscriptionRef = doc(collection(db, 'subscriptions'));
    const orderRef = doc(collection(db, 'orders'));
    const subscriptionNumber = `SUB-${subscriptionRef.id.slice(0, 8).toUpperCase()}`;
    const subscriptionOrderNumber = orderNumber();
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

  const offerResult = (input.oneTimeItems.length || input.subscriptionItems.length)
    ? await calculateCustomerOffers({
        pincode: String(address.pincode ?? ''),
        oneTimeSubtotal: oneSubtotal,
        subscriptionSubtotal: subscriptionWrites.reduce((sum, item) => sum + number(item.order.subtotal), 0),
        oneTimeDelivery: oneDeliveryFee,
      })
    : { priceSavings: 0, oneTimePriceSavings: 0, subscriptionPriceSavings: 0, deliverySavings: 0, totalSavings: 0 };
  const deliveryOfferSavings = input.subscriptionItems.length > 0 ? 0 : offerResult.deliverySavings;
  const finalOneDeliveryFee = Math.max(0, oneDeliveryFee - deliveryOfferSavings);
  const oneTimeOfferSavings = Math.min(oneSubtotal, offerResult.oneTimePriceSavings);
  let remainingSubscriptionOfferSavings = Number(offerResult.subscriptionPriceSavings || 0);
  for (let index = 0; index < subscriptionWrites.length; index += 1) {
    const write = subscriptionWrites[index];
    const subtotal = number(write.order.subtotal);
    const allocated = index === subscriptionWrites.length - 1
      ? Math.min(subtotal, remainingSubscriptionOfferSavings)
      : Math.min(subtotal, Math.round((Number(offerResult.subscriptionPriceSavings || 0) * subtotal / Math.max(1, subscriptionWrites.reduce((sum, item) => sum + number(item.order.subtotal), 0))) * 100) / 100);
    remainingSubscriptionOfferSavings = Math.max(0, Math.round((remainingSubscriptionOfferSavings - allocated) * 100) / 100);
    write.order.discount = allocated;
    write.order.offerDiscount = allocated;
    write.order.offerPriceSavings = allocated;
    write.order.offerDeliverySavings = 0;
    write.order.offerPriceName = offerResult.priceOffer?.name || '';
    write.order.offerDeliveryName = '';
    write.order.offerTotalSavings = allocated;
    write.order.total = Math.max(0, subtotal - allocated) + number(write.order.deliveryFee);
  }
  const oneOrderGroups = groupOneTimeOrderItemsByDeliveryDate(oneOrderItems, targetDate);
  const oneOrderDates = oneOrderGroups.map(([date]) => date);
  const oneOrderWrites: Array<{ ref: ReturnType<typeof doc>; orderNumber: string; order: Record<string, unknown> }> = [];
  let remainingOneOffer = oneTimeOfferSavings;
  for (let index = 0; index < oneOrderDates.length; index += 1) {
    const date = oneOrderDates[index];
    const items = oneOrderGroups.find(([groupDate]) => groupDate === date)?.[1] || [];
    const groupSubtotal = items.reduce((sum, item) => sum + number(item.lineTotal), 0);
    const groupMrpSubtotal = items.reduce((sum, item) => sum + number(item.mrp, number(item.unitPrice)) * number(item.quantity), 0);
    const allocatedOffer = index === oneOrderDates.length - 1
      ? Math.min(groupSubtotal, remainingOneOffer)
      : Math.min(groupSubtotal, Math.round((oneTimeOfferSavings * groupSubtotal / Math.max(1, oneSubtotal)) * 100) / 100);
    remainingOneOffer = Math.max(0, Math.round((remainingOneOffer - allocatedOffer) * 100) / 100);
    const groupDeliveryFee = index === 0 ? finalOneDeliveryFee : 0;
    const groupDeliveryOriginal = index === 0 ? oneDeliveryFee : 0;
    const groupDeliverySavings = index === 0 ? deliveryOfferSavings : 0;
    const groupProductSavings = Math.max(0, groupMrpSubtotal - groupSubtotal) + allocatedOffer;
    const oneOrderRef = doc(collection(db, 'orders'));
    const oneOrderNumber = orderNumber();
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
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }) });
  }

  const batch = writeBatch(db);
  for (const item of oneOrderWrites) batch.set(item.ref, item.order);
  for (const item of subscriptionWrites) {
    batch.set(item.subscriptionRef, item.subscription);
    batch.set(item.orderRef, item.order);
  }
  await batch.commit();

  const subscriptionTotal = subscriptionWrites.reduce((sum, item) => sum + number(item.order.total), 0);
  const oneTimeTotal = oneOrderWrites.reduce((sum, item) => sum + number(item.order.total), 0);
  return {
    oneTimeOrderId: oneOrderWrites[0]?.ref.id || '',
    oneTimeOrderIds: oneOrderWrites.map((item) => item.ref.id),
    oneTimeOrderNumber: oneOrderWrites[0]?.orderNumber || '',
    oneTimeOrderNumbers: oneOrderWrites.map((item) => item.orderNumber),
    subscriptionOrderIds: subscriptionWrites.map((item) => item.orderRef.id),
    subscriptionNumbers: subscriptionWrites.map((item) => String(item.subscription.subscriptionNumber)),
    paymentOrderIds: [...oneOrderWrites.map((item) => item.ref.id), ...subscriptionWrites.map((item) => item.orderRef.id)],
    total: oneTimeTotal + subscriptionTotal,
    primaryOrderId: oneOrderWrites[0]?.ref.id || subscriptionWrites[0]?.orderRef.id || '',
    primaryOrderNumber: oneOrderWrites[0]?.orderNumber || String(subscriptionWrites[0]?.order.orderNumber || ''),
    paymentAttemptId,
  };
}
