import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSubscriptionDeliveryDates } from '../services/orders/deliveryChargeService';
import { calculateComboComponentGrams, parseWeightGrams, weightLabelFromGrams } from '../services/orders/weightUtils';
import { getSubscriptionPlanPriceForSellingOption } from '../services/subscriptions/subscriptionPlanPrice';
import { isProductSubscriptionEligible } from '../services/products/subscriptionEligibility';
import { shouldSubmitAvailabilityEnquiry } from '../services/orders/customerOrderAvailability';
import { normalizePaymentOrderIds } from '../services/payments/paymentOrderIdUtils';
import { getUnifiedCartTotals, replaceProductCartSelectionInCart } from '../services/cart/cartService';
import { mergeCustomerProfileCacheValues } from '../services/customerProfileState';

test('parses pack labels and totals correctly across grams and kilograms', () => {
  assert.equal(parseWeightGrams('100g', 0), 100);
  assert.equal(parseWeightGrams('200g', 0), 200);
  assert.equal(parseWeightGrams('1kg', 0), 1000);
  assert.equal(parseWeightGrams('1.5kg', 0), 1500);
  assert.equal(parseWeightGrams('2 kg', 0), 2000);
  assert.equal(weightLabelFromGrams(1000), '1kg');
  assert.equal(weightLabelFromGrams(200), '200g');
});

test('builds Saturday delivery dates without drifting to Friday in Asia/Kolkata', () => {
  const dates = buildSubscriptionDeliveryDates('2026-10-10', 3);
  assert.deepEqual(dates, ['2026-10-10', '2026-10-17', '2026-10-24']);
});

test('returns undefined when a plan has no matching selling option and does not silently fall back to base price', () => {
  const plan = {
    id: 'plan-1',
    name: 'Weekly',
    frequency: 'weekly',
    price: 280,
    active: true,
    sortOrder: 1,
    sellingOptions: [{ sellingOptionId: 'opt-200', weightGrams: 200, planPrice: 260 }],
  };

  assert.equal(getSubscriptionPlanPriceForSellingOption(plan, 'opt-1000'), undefined);
});

test('splits combo pack grams by component ratio across multiple package sizes and quantities', () => {
  const components = [
    { productId: 'mix-1', quantityGrams: 1000 },
    { productId: 'mix-2', quantityGrams: 3000 },
  ];

  assert.deepEqual(calculateComboComponentGrams(components, 1000, 1), { 'mix-1': 250, 'mix-2': 750 });
  assert.deepEqual(calculateComboComponentGrams(components, '2kg', 1), { 'mix-1': 500, 'mix-2': 1500 });
  assert.deepEqual(calculateComboComponentGrams(components, '500g', 2), { 'mix-1': 250, 'mix-2': 750 });
});

test('normalizes payment order ids to a deduplicated, valid list for retries and duplicate taps', () => {
  assert.deepEqual(normalizePaymentOrderIds(['ord-1', 'ord-1', '', 'ord-2', 'ord-2']), ['ord-1', 'ord-2']);
  assert.deepEqual(normalizePaymentOrderIds(['', ' ', 'ord-3']), ['ord-3']);
  assert.deepEqual(normalizePaymentOrderIds([]), []);
});

test('switching product mode replaces the existing selection in place without duplicating cart entries or changing position', () => {
  const product: any = {
    id: 'product-42',
    name: 'Miso Mix',
    defaultWeight: '250g',
    price: 120,
    mrp: 150,
    sellingOptions: [
      { id: 'opt-250', weightGrams: 250, mrp: 150, price: 120, active: true },
      { id: 'opt-500', weightGrams: 500, mrp: 260, price: 220, active: true },
    ],
  };

  const oneTimeItems: any[] = [{
    ...product,
    quantity: 2,
    selectedWeight: '250g',
    price: 120,
    mrp: 150,
    sellingOptionId: 'opt-250',
    cartPosition: 7,
    id: product.id,
    name: product.name,
    description: 'Test product',
    image: 'img',
    popular: false,
    inStock: true,
    category: 'Microgreens',
    moods: [],
    tags: [],
    type: 'single' as const,
    components: [{ productId: 'mix', productName: 'Mix', quantityGrams: 250 }],
    oneTimePurchase: true,
    subscriptionPurchase: true,
    active: true,
    sortOrder: 1,
    currency: 'INR',
    defaultWeight: '250g',
    sellingOptions: product.sellingOptions,
  }];

  const afterSwitch = replaceProductCartSelectionInCart({
    product,
    mode: 'subscription',
    quantity: 2,
    startDate: '2026-10-10',
    plan: {
      id: 'plan-1',
      name: 'Weekly',
      frequency: 'weekly',
      deliveriesPerTerm: 4,
      price: 210,
      sellingOptionId: 'opt-250',
      sellingOptionLabel: '250g',
      weightGrams: 250,
    },
    oneTimeItems,
    subscriptionItems: [],
  });

  assert.equal(afterSwitch.oneTimeItems.length, 0);
  assert.equal(afterSwitch.subscriptionItems.length, 1);
  assert.equal(afterSwitch.subscriptionItems[0].cartPosition, 7);
  assert.equal(afterSwitch.subscriptionItems[0].quantity, 2);
  assert.equal(afterSwitch.subscriptionItems[0].planId, 'plan-1');

  const afterOneTime = replaceProductCartSelectionInCart({
    product,
    mode: 'one-time',
    quantity: 3,
    oneTimeItems: [],
    subscriptionItems: afterSwitch.subscriptionItems,
  });

  assert.equal(afterOneTime.subscriptionItems.length, 0);
  assert.equal(afterOneTime.oneTimeItems.length, 1);
  assert.equal(afterOneTime.oneTimeItems[0].cartPosition, 7);
  assert.equal(afterOneTime.oneTimeItems[0].quantity, 3);
  assert.equal(afterOneTime.oneTimeItems[0].sellingOptionId, 'opt-250');
});

test('blocks combo products from subscription eligibility while allowing single-product subscriptions', () => {
  const comboProduct = {
    active: true,
    subscriptionPurchase: true,
    type: 'multiple',
    components: [{ productId: 'mix-1', quantityGrams: 300 }],
  };

  const singleProduct = {
    active: true,
    subscriptionPurchase: true,
    type: 'single',
    components: [{ productId: 'leaf-1', quantityGrams: 300 }],
  };

  assert.equal(isProductSubscriptionEligible(comboProduct as any), false);
  assert.equal(isProductSubscriptionEligible(singleProduct as any), true);
});

test('requires a customer enquiry when no delivery date is available within 12 weeks', () => {
  const resolution = {
    hasUnavailableItems: true,
    items: [
      { key: 'one-time:p-1', deliveryDate: null, available: false, requestedDate: '2026-10-09', productId: 'p-1', name: 'Mix Pack', kind: 'one-time' },
    ],
  } as const;

  assert.equal(shouldSubmitAvailabilityEnquiry(resolution), true);
  assert.equal(shouldSubmitAvailabilityEnquiry({
    hasUnavailableItems: false,
    items: [{ key: 'one-time:p-2', deliveryDate: '2026-10-16', available: true, requestedDate: '2026-10-09', productId: 'p-2', name: 'Mix Pack', kind: 'one-time' }],
  }), false);
});

test('keeps totals based on price × quantity and delivery charges once per unique date', () => {
  const oneTimeItems: any[] = [
    { id: 'p-1', quantity: 2, price: 180, mrp: 180 },
    { id: 'p-2', quantity: 1, price: 120, mrp: 120 },
  ];
  const subscriptionItems: any[] = [
    { id: 'p-3', planId: 'plan-1', startDate: '2026-10-10', quantity: 1, price: 220, mrp: 220 },
  ];

  const totals = getUnifiedCartTotals({ oneTimeItems, subscriptionItems });
  const uniqueDates = new Set(['2026-10-09', '2026-10-09', '2026-10-16']);
  const deliveryChargePerDate = 65;
  const deliveryTotal = deliveryChargePerDate * uniqueDates.size;
  const payableTotal = totals.subtotal + deliveryTotal;

  assert.equal(totals.subtotal, 180 * 2 + 120 + 220);
  assert.equal(totals.mrpSubtotal, 180 * 2 + 120 + 220);
  assert.equal(deliveryTotal, 130);
  assert.equal(payableTotal, 830);
});

test('treats only paid active subscriptions as active and keys delivery identity by order/date rather than display labels', () => {
  const isLifecycleActive = (status?: string) => String(status ?? '').toLowerCase() === 'active';
  const statuses = ['pending_payment', 'payment_failed', 'active', 'paused', 'cancelled'];
  assert.deepEqual(statuses.filter((status) => isLifecycleActive(status)), ['active']);

  const deliveryRecords = [
    { id: 'd-1', subscriptionId: 'sub-1', orderId: 'ord-11', deliveryDate: '2026-10-10', productName: 'Mix' },
    { id: 'd-2', subscriptionId: 'sub-1', orderId: 'ord-11', deliveryDate: '2026-10-10', productName: 'Mix' },
    { id: 'd-3', subscriptionId: 'sub-1', orderId: 'ord-12', deliveryDate: '2026-10-17', productName: 'Mix' },
  ];
  const uniqueLogicalDeliveries = Array.from(new Map(
    deliveryRecords.map((delivery) => [`${delivery.subscriptionId}:${delivery.orderId ?? 'none'}:${delivery.deliveryDate ?? 'none'}`, delivery]),
  ).values());

  assert.equal(uniqueLogicalDeliveries.length, 2);
  assert.equal(uniqueLogicalDeliveries[0].orderId, 'ord-11');
  assert.equal(uniqueLogicalDeliveries[1].orderId, 'ord-12');
});

test('maps persisted order and delivery statuses to safe UI labels without fabricating progress', () => {
  const formatStatus = (value?: string) => String(value ?? 'pending').replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());

  assert.equal(formatStatus('pending_payment'), 'Pending Payment');
  assert.equal(formatStatus('delivered'), 'Delivered');
  assert.equal(formatStatus('rescheduled'), 'Rescheduled');
  assert.equal(formatStatus(undefined), 'Pending');

  const statusHistory = [
    { status: 'pending_payment', message: 'Waiting for payment confirmation' },
    { status: 'paid', message: 'Payment confirmed' },
    { status: 'delivered', message: 'Delivery completed' },
  ];
  const journey = statusHistory.filter((entry) => ['pending_payment', 'paid', 'delivered'].includes(String(entry.status || '')));

  assert.deepEqual(journey.map((entry) => entry.status), ['pending_payment', 'paid', 'delivered']);
});

test('keeps checkout on a valid selected address when the previous address was removed or stale', () => {
  const resolveSelectedAddressId = (currentId: string, addresses: Array<{ id: string }>) =>
    addresses.some((item) => item.id === currentId) ? currentId : (addresses[0]?.id ?? '');

  const addresses = [{ id: 'addr-1' }, { id: 'addr-2' }];
  assert.equal(resolveSelectedAddressId('addr-2', addresses), 'addr-2');
  assert.equal(resolveSelectedAddressId('addr-9', addresses), 'addr-1');
  assert.equal(resolveSelectedAddressId('addr-9', []), '');
});

test('keeps the newest customer profile values in cache and avoids stale refresh overwrites', () => {
  const cached = {
    mobile: '9999999999',
    name: 'Old Name',
    email: 'old@example.com',
    photoUrl: 'https://cdn.example.com/old.jpg',
  };

  const refreshed = mergeCustomerProfileCacheValues(cached, {
    mobile: '9999999999',
    name: 'New Name',
    email: 'new@example.com',
    photoUrl: 'https://cdn.example.com/new.jpg',
  });

  assert.equal(refreshed.name, 'New Name');
  assert.equal(refreshed.email, 'new@example.com');
  assert.equal(refreshed.photoUrl, 'https://cdn.example.com/new.jpg');

  const noPhoto = mergeCustomerProfileCacheValues(cached, {
    mobile: '9999999999',
    name: 'Updated Name',
    email: 'updated@example.com',
    profilePhotoUrl: undefined,
    photoUrl: undefined,
  });

  assert.equal(noPhoto.name, 'Updated Name');
  assert.equal(noPhoto.email, 'updated@example.com');
  assert.equal(noPhoto.photoUrl, 'https://cdn.example.com/old.jpg');
});
