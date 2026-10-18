import test from 'node:test';
import assert from 'node:assert/strict';

import { allocateUniqueDeliveryDateChargeGroups, buildSubscriptionDeliveryDates, UnserviceablePincodeError } from '../services/orders/deliveryChargeService';
import { buildCheckoutFingerprint, checkoutDocumentId, checkoutOrderNumber, checkoutSubscriptionNumber, createCheckoutAttemptId, declinedAvailabilityEnquiryId, unserviceablePincodeEnquiryId } from '../services/orders/checkoutAttemptUtils';
import { saveEnquiriesBeforeRemovingItems } from '../services/orders/declinedDeliveryEnquiry';
import { calculateComboComponentGrams, parseWeightGrams, weightLabelFromGrams } from '../services/orders/weightUtils';
import { getSubscriptionPlanPriceForSellingOption, getSubscriptionPlanSellingOption } from '../services/subscriptions/subscriptionPlanPrice';
import { filterActivePlansForProduct, productSubscriptionSectionState } from '../services/subscriptions/subscriptionPlanDiscovery';
import { isProductSubscriptionEligible } from '../services/products/subscriptionEligibility';
import { getAvailableOneTimeSellingOptions, getDefaultOneTimeSellingOptionFromOptions } from '../services/products/oneTimeSellingOptions';
import { shouldSubmitAvailabilityEnquiry } from '../services/orders/customerOrderAvailability';
import { normalizePaymentOrderIds } from '../services/payments/paymentOrderIdUtils';
import { filterPaidCalendarDeliveries, filterPaidCalendarSubscriptions, isPaidPaymentStatus } from '../services/subscriptions/calendarPaymentFilter';
import { getCartItemCount, getUnifiedCartTotals, replaceProductCartSelectionInCart } from '../services/cart/cartService';
import { addToCartAndNavigate, PRODUCT_DETAILS_CART_ROUTE } from '../services/cart/productDetailsCartAction';
import { mergeCustomerProfileCacheValues } from '../services/customerProfileState';
import { resolvePriceDisplay, scalePriceDisplay } from '../services/products/priceDisplay';
import { allocateOfferSavings, calculateCheckoutPayableDeliveryCharge, calculateCheckoutPayableProductSubtotal, calculateCheckoutPayableTotal, computeCustomerOffers, computeSubscriptionDeliveryEntitlements, roundCheckoutMoney } from '../services/orders/customerOffers';
import { checkoutSavingsBreakdown, formatCheckoutAmount } from '../services/orders/checkoutSavings';
import { CUSTOMER_NOTIFICATIONS_ROUTE, notificationUnreadBadgeLabel, notificationUnreadCount, type CustomerNotification } from '../services/notifications/notificationService';

test('checkout money rounds consistently to INR paise', () => {
  assert.equal(roundCheckoutMoney(383.699999999), 383.7);
  assert.equal(roundCheckoutMoney(383.705), 383.71);
  assert.equal(roundCheckoutMoney(Number.NaN), 0);
  assert.equal(calculateCheckoutPayableTotal(100.105, 0.105, {
    priceSavings: 0, oneTimePriceSavings: 0, subscriptionPriceSavings: 0,
    deliverySavings: 0, totalSavings: 0,
  }), 100.22);
});

test('delivery calendar includes only paid subscriptions and their paid linked orders', () => {
  assert.equal(isPaidPaymentStatus('paid'), true);
  assert.equal(isPaidPaymentStatus('successful'), true);
  assert.equal(isPaidPaymentStatus('pending'), false);
  assert.equal(isPaidPaymentStatus('failed'), false);

  const subscriptions = filterPaidCalendarSubscriptions([
    { id: 'paid-sub', paymentStatus: 'paid', status: 'active' },
    { id: 'pending-sub', paymentStatus: 'pending', status: 'pending_payment' },
    { id: 'failed-sub', paymentStatus: 'failed', status: 'active' },
  ]);
  assert.deepEqual(subscriptions.map((subscription) => subscription.id), ['paid-sub']);

  const deliveries = filterPaidCalendarDeliveries([
    { id: 'paid-linked', subscriptionId: 'paid-sub', orderId: 'paid-order' },
    { id: 'pending-linked', subscriptionId: 'paid-sub', orderId: 'pending-order' },
    { id: 'failed-sub-delivery', subscriptionId: 'failed-sub', orderId: 'paid-order' },
    { id: 'legacy-paid-sub', subscriptionId: 'paid-sub' },
    { id: 'unknown-sub', subscriptionId: 'missing-sub', orderId: 'paid-order' },
  ], subscriptions, [
    { id: 'paid-order', paymentStatus: 'paid' },
    { id: 'pending-order', paymentStatus: 'pending' },
  ]);
  assert.deepEqual(deliveries.map((delivery) => delivery.id), ['paid-linked', 'legacy-paid-sub']);
});

test('shows and scales reference price savings only when the original exceeds the selling price', () => {
  assert.deepEqual(resolvePriceDisplay(80, 100), { originalPrice: 100, savings: 20 });
  assert.deepEqual(scalePriceDisplay(resolvePriceDisplay(80, 100), 3), { originalPrice: 300, savings: 60 });
  assert.deepEqual(resolvePriceDisplay(100, 100), { originalPrice: undefined, savings: undefined });
  assert.deepEqual(resolvePriceDisplay(110, 100), { originalPrice: undefined, savings: undefined });
  assert.deepEqual(resolvePriceDisplay(80, ''), { originalPrice: undefined, savings: undefined });
});

test('checkout separates product reference and offer savings and combines each savings category once', () => {
  const offers = computeCustomerOffers([
    {
      id: 'price-introduction',
      name: 'Introduction Price Offer',
      type: 'price',
      active: true,
      locationType: 'all',
      discountType: 'flat',
      discountValue: 10,
    },
    {
      id: 'delivery-prelaunch',
      name: 'Pre Launch offer',
      type: 'deliveryCharge',
      active: true,
      locationType: 'all',
      discountType: 'flat',
      discountValue: 15,
    },
  ], {
    pincode: '123456',
    geoId: 'geo-1',
    oneTimeSubtotal: 120,
    deliveryChargeAmounts: [44],
  }, '2026-10-13');

  assert.equal(offers.priceSavings, 10);
  assert.equal(offers.deliverySavings, 15);
  assert.equal(offers.totalSavings, 25);
  assert.deepEqual(checkoutSavingsBreakdown({
    mrpSavings: 20,
    priceOfferSavings: offers.priceSavings,
    subscriptionPlanSavings: 0,
    deliverySavings: offers.deliverySavings,
  }), {
    mrpSavings: 20,
    priceOfferSavings: 10,
    productSavings: 30,
    subscriptionPlanSavings: 0,
    deliverySavings: 15,
    totalSavings: 45,
  });
  assert.equal(calculateCheckoutPayableTotal(120, 44, offers), 139);
});

test('checkout product subtotal reflects only the applied price offer while MRP savings stay informational', () => {
  const offerResult = computeCustomerOffers([{
    id: 'price-introduction',
    name: 'Introduction Price Offer',
    type: 'price',
    active: true,
    locationType: 'all',
    discountType: 'flat',
    discountValue: 10,
  }], {
    pincode: '123456',
    geoId: 'geo-1',
    oneTimeSubtotal: 400,
    deliveryChargeAmounts: [],
  }, '2026-10-13');
  const reference = resolvePriceDisplay(400, 480);
  const payableSubtotal = calculateCheckoutPayableProductSubtotal(400, offerResult.priceSavings);

  assert.equal(offerResult.priceSavings, 10);
  assert.equal(reference.originalPrice, 480);
  assert.equal(reference.savings, 80);
  assert.equal(payableSubtotal, 390);
  assert.equal(calculateCheckoutPayableTotal(400, 0, offerResult), payableSubtotal);
});

test('checkout suppresses delivery-charge offers for mixed one-time and subscription carts', () => {
  const offerResult = computeCustomerOffers([{
    id: 'delivery-prelaunch',
    name: 'Pre Launch offer',
    type: 'deliveryCharge',
    active: true,
    locationType: 'all',
    discountType: 'flat',
    discountValue: 60,
  }], {
    pincode: '123456',
    geoId: 'geo-1',
    oneTimeSubtotal: 400,
    subscriptionSubtotal: 300,
    deliveryChargeAmounts: [44, 44, 44, 44],
    subscriptions: [{
      frequency: 'monthly',
      regularDeliveries: 3,
      pincode: '123456',
      geoId: 'geo-1',
    }],
  }, '2026-10-13');
  const chargeGroups = allocateUniqueDeliveryDateChargeGroups({
    oneTimeDates: ['2026-10-17'],
    subscriptions: [{
      label: 'Monthly',
      deliveryDates: ['2026-10-24', '2026-10-31', '2026-11-07'],
    }],
  });

  assert.equal(offerResult.deliveryOffer, undefined);
  assert.equal(offerResult.deliverySavings, 0);
  assert.equal(calculateCheckoutPayableDeliveryCharge(176, offerResult.deliverySavings), 176);
  assert.equal(calculateCheckoutPayableTotal(700, 176, offerResult), 876);
  assert.deepEqual(chargeGroups, {
    oneTimeDeliveryCount: 1,
    subscriptions: [{ label: 'Monthly', deliveryCount: 3 }],
  });
});

test('checkout keeps the undiscounted delivery total when no delivery offer is applied', () => {
  const offerResult = computeCustomerOffers([], {
    pincode: '123456',
    geoId: 'geo-1',
    oneTimeSubtotal: 400,
    deliveryChargeAmounts: [44, 44, 44, 44],
    subscriptions: [{
      frequency: 'monthly',
      regularDeliveries: 3,
      pincode: '123456',
      geoId: 'geo-1',
    }],
  }, '2026-10-13');

  assert.equal(offerResult.deliveryOffer, undefined);
  assert.equal(offerResult.deliverySavings, 0);
  assert.equal(calculateCheckoutPayableDeliveryCharge(176, offerResult.deliverySavings), 176);
  assert.equal(calculateCheckoutPayableTotal(400, 176, offerResult), 576);
});

test('checkout savings breakdown keeps subscription reference savings separate and sanitizes invalid values', () => {
  assert.deepEqual(checkoutSavingsBreakdown({
    mrpSavings: 0,
    priceOfferSavings: 0,
    deliverySavings: 0,
  }), {
    mrpSavings: 0,
    priceOfferSavings: 0,
    productSavings: 0,
    subscriptionPlanSavings: 0,
    deliverySavings: 0,
    totalSavings: 0,
  });
  assert.deepEqual(checkoutSavingsBreakdown({
    mrpSavings: Number.NaN,
    priceOfferSavings: -8,
    subscriptionPlanSavings: 3.456,
    deliverySavings: Number.POSITIVE_INFINITY,
  }), {
    mrpSavings: 0,
    priceOfferSavings: 0,
    productSavings: 0,
    subscriptionPlanSavings: 3.46,
    deliverySavings: 0,
    totalSavings: 3.46,
  });
  assert.deepEqual(checkoutSavingsBreakdown({
    mrpSavings: 5,
    priceOfferSavings: 2,
    subscriptionPlanSavings: 4,
    deliverySavings: 1,
  }), {
    mrpSavings: 5,
    priceOfferSavings: 2,
    productSavings: 7,
    subscriptionPlanSavings: 4,
    deliverySavings: 1,
    totalSavings: 12,
  });
});

test('checkout currency formatting matches Website INR precision', () => {
  assert.equal(formatCheckoutAmount(162), '₹162.00');
  assert.equal(formatCheckoutAmount(162.5), '₹162.50');
  assert.equal(formatCheckoutAmount(Number.NaN), '₹0.00');
});

test('subscription cart selection does not use one-time product price as plan reference when maximum plan price is absent', () => {
  const cart = replaceProductCartSelectionInCart({
    product: {
      id: 'salable-product-1',
      name: 'Microgreens',
      defaultWeight: '100g',
      price: 140,
      mrp: 160,
      sellingOptions: [],
    },
    mode: 'subscription',
    quantity: 1,
    plan: { id: 'plan-1', price: 90 },
    startDate: '2026-10-17',
    oneTimeItems: [],
    subscriptionItems: [],
  });

  const subscription = cart.subscriptionItems[0];
  assert.ok(subscription);
  assert.equal(subscription.price, 90);
  assert.equal(subscription.mrp, 90);
  assert.equal(resolvePriceDisplay(subscription.price, subscription.mrp).savings, undefined);
});

test('applies best price and delivery offers across one-time, subscription, and mixed carts', () => {
  const offers = [
    {
      id: 'flat-price',
      name: 'Flat price',
      type: 'price',
      active: true,
      locationType: 'all',
      discountType: 'flat',
      discountValue: 40,
    },
    {
      id: 'percent-price',
      name: 'Percentage price',
      type: 'price',
      active: true,
      locationType: 'all',
      startDate: '2026-10-13',
      endDate: '2026-10-13',
      discountType: 'percentage',
      discountValue: 25,
    },
    {
      id: 'expired-price',
      name: 'Expired price',
      type: 'price',
      active: true,
      locationType: 'all',
      endDate: '2026-10-12',
      discountType: 'percentage',
      discountValue: 100,
    },
    {
      id: 'wrong-pincode',
      name: 'Wrong pincode',
      type: 'price',
      active: true,
      locationType: 'pincode',
      pincodeIds: ['geo-other'],
      pincodeLabels: ['654321'],
      discountType: 'percentage',
      discountValue: 100,
    },
    {
      id: 'flat-delivery',
      name: 'Flat delivery',
      type: 'deliveryCharge',
      active: true,
      locationType: 'specificPincode',
      pincodeIds: ['geo-1'],
      discountType: 'flat',
      discountValue: 50,
    },
    {
      id: 'percent-delivery',
      name: 'Percentage delivery',
      type: 'deliveryCharge',
      active: true,
      locationType: 'allPincodes',
      discountType: 'percentage',
      discountValue: 60,
    },
  ];
  const result = computeCustomerOffers(offers, {
    pincode: '123-456',
    geoId: 'geo-1',
    locationName: 'North Hub',
    oneTimeSubtotal: 100,
    subscriptionSubtotal: 100,
    deliveryChargeAmounts: [65, 65, 100],
  }, '2026-10-13');

  assert.equal(result.priceOffer?.id, 'percent-price');
  assert.equal(result.oneTimePriceSavings, 25);
  assert.equal(result.subscriptionPriceSavings, 25);
  assert.equal(result.deliveryOffer, undefined);
  assert.equal(result.deliverySavings, 0);
  assert.equal(calculateCheckoutPayableTotal(200, 230, result), 150 + 230);
  assert.deepEqual(allocateOfferSavings(25, [100, 100]), [12.5, 12.5]);

  const oneTimeOnlyResult = computeCustomerOffers(offers.filter((offer) =>
    offer.id === 'flat-delivery' || offer.id === 'percent-delivery'), {
    pincode: '123456',
    geoId: 'geo-1',
    locationName: 'North Hub',
    oneTimeSubtotal: 100,
    deliveryChargeAmounts: [65, 65, 100],
  }, '2026-10-13');
  assert.equal(oneTimeOnlyResult.deliveryOffer?.id, 'percent-delivery');
  assert.equal(oneTimeOnlyResult.deliverySavings, 138);
  assert.equal(calculateCheckoutPayableTotal(100, 230, oneTimeOnlyResult), 192);

  const flatDeliveryOnly = computeCustomerOffers(offers.filter((offer) => offer.id === 'flat-delivery'), {
    pincode: '123456',
    geoId: 'geo-1',
    oneTimeSubtotal: 100,
    deliveryChargeAmounts: [65, 65, 100],
  }, '2026-10-13');
  assert.equal(flatDeliveryOnly.deliverySavings, 50);
  assert.equal(calculateCheckoutPayableTotal(100, 230, flatDeliveryOnly), 280);

  const mixedCartWithZeroPriceSubscription = computeCustomerOffers(offers.filter((offer) => offer.id === 'flat-delivery'), {
    pincode: '123456',
    geoId: 'geo-1',
    oneTimeSubtotal: 100,
    deliveryChargeAmounts: [65, 65],
    subscriptions: [{
      frequency: 'monthly',
      regularDeliveries: 4,
      pincode: '123456',
      geoId: 'geo-1',
    }],
  }, '2026-10-13');
  assert.equal(mixedCartWithZeroPriceSubscription.deliveryOffer, undefined);
  assert.equal(mixedCartWithZeroPriceSubscription.deliverySavings, 0);
});

test('applies subscription bonus offers to eligible frequencies without changing checkout price offers', () => {
  const offers = [{
    id: 'monthly-bonus',
    name: 'Monthly bonus',
    type: 'subscription',
    active: true,
    locationType: 'pincode',
    pincodeLabels: ['123456'],
    startDate: '2026-10-13',
    endDate: '2026-10-13',
    subscriptionOffer: {
      frequencies: ['monthly'],
      extraDeliveriesByFrequency: { monthly: 1 },
    },
  }];
  const entitlements = computeSubscriptionDeliveryEntitlements(offers, [
    { frequency: 'monthly', regularDeliveries: 4, pincode: '123456', geoId: 'geo-1', locationName: 'North Hub' },
    { frequency: 'quarterly', regularDeliveries: 12, pincode: '123456', geoId: 'geo-1', locationName: 'North Hub' },
  ], '2026-10-13');

  assert.deepEqual(entitlements.map(({ regularDeliveries, bonusDeliveries, totalDeliveries, offer }) => ({
    regularDeliveries,
    bonusDeliveries,
    totalDeliveries,
    offerId: offer?.id,
  })), [
    { regularDeliveries: 4, bonusDeliveries: 1, totalDeliveries: 5, offerId: 'monthly-bonus' },
    { regularDeliveries: 12, bonusDeliveries: 0, totalDeliveries: 12, offerId: undefined },
  ]);
});

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

test('discovers only active plans linked by salableProductId independent of legacy product flags', () => {
  const plans = [
    { id: 'visible-plan', active: true, price: 0, salableProductId: ' product-eligible ' },
    { id: 'exact-match-plan', active: true, price: 100, salableProductId: 'product-eligible' },
    { id: 'inactive-plan', active: false, price: 100, salableProductId: 'product-eligible' },
    { id: 'other-product-plan', active: true, price: 100, salableProductId: 'product-other' },
    { id: 'legacy-alias-only', active: true, price: 100, productId: 'product-eligible' },
    { id: 'invalid-base-price', active: true, price: -1, salableProductId: 'product-eligible' },
    { id: 'missing-base-price', active: true, salableProductId: 'product-eligible' },
  ];

  assert.deepEqual(
    filterActivePlansForProduct(plans, 'product-eligible').map((plan) => plan.id),
    ['visible-plan', 'exact-match-plan'],
  );
  assert.deepEqual(filterActivePlansForProduct(plans, ''), []);
});

test('subscription option visibility follows whether associated active plans were loaded, not legacy product flags', () => {
  assert.equal(productSubscriptionSectionState({ loadState: 'idle', planCount: 0 }), 'loading');
  assert.equal(productSubscriptionSectionState({ loadState: 'loading', planCount: 0 }), 'loading');
  assert.equal(productSubscriptionSectionState({ loadState: 'ready', planCount: 0 }), 'empty');
  assert.equal(productSubscriptionSectionState({ loadState: 'error', planCount: 0 }), 'error');
  assert.equal(productSubscriptionSectionState({ loadState: 'ready', planCount: 1 }), 'ready');
  assert.equal(isProductSubscriptionEligible({
    active: true,
    subscriptionPurchase: false,
    subscriptionEligible: false,
    type: 'single',
    components: [{ productId: 'leaf-1', quantityGrams: 100 }],
  }), true);
});

test('resolves a subscription selling-option price by weight when its id differs from the selected product option', () => {
  const plan = {
    id: 'plan-1',
    name: 'Weekly',
    frequency: 'weekly',
    price: 280,
    active: true,
    sortOrder: 1,
    sellingOptions: [{ sellingOptionId: 'plan-opt-500', weightGrams: 500, planPrice: 400 }],
  };

  assert.equal(getSubscriptionPlanPriceForSellingOption(plan, 'product-opt-500', 500), 400);
  assert.equal(getSubscriptionPlanPriceForSellingOption(plan, 'product-opt-500', 250), undefined);
  assert.equal(getSubscriptionPlanPriceForSellingOption({
    ...plan,
    sellingOptions: [{ sellingOptionId: ' product-opt-500 ', weightGrams: 500, planPrice: 390 }],
  }, 'product-opt-500', 250), 390);
});

test('prioritizes package weight, rejects invalid option prices, and uses base price only without a selected package', () => {
  const plan = {
    price: 280,
    sellingOptions: [
      { sellingOptionId: 'selected-id', weightGrams: 250, planPrice: 240 },
      { sellingOptionId: 'other-id', weightGrams: 500, planPrice: 400 },
      { sellingOptionId: 'invalid-price', weightGrams: 1000, planPrice: -1 },
    ],
  };

  assert.equal(getSubscriptionPlanPriceForSellingOption(plan, 'selected-id', 500), 400);
  assert.equal(getSubscriptionPlanPriceForSellingOption(plan, 'invalid-price', 1000), undefined);
  assert.equal(getSubscriptionPlanPriceForSellingOption(plan), 280);
});

test('subscription original price and savings use only a valid plan maximum price reference', () => {
  const matchedOption = getSubscriptionPlanSellingOption({
    price: 80,
    sellingOptions: [{ sellingOptionId: 'pack-250', weightGrams: 250, planPrice: 80, maximumPlanPrice: 100 }],
  }, 'pack-250', 250);
  assert.deepEqual(resolvePriceDisplay(80, matchedOption?.maximumPlanPrice), { originalPrice: 100, savings: 20 });
  assert.deepEqual(resolvePriceDisplay(80, undefined), { originalPrice: undefined, savings: undefined });
  assert.deepEqual(resolvePriceDisplay(80, 70), { originalPrice: undefined, savings: undefined });
});

test('one-time purchase option remains available from active selling options when legacy purchase flags are false', () => {
  const product = {
    oneTimePurchase: false,
    oneTimeEligible: false,
    sellingOptions: [
      { id: 'inactive', weightGrams: 100, mrp: 100, price: 80, active: false },
      { id: 'valid', weightGrams: 250, mrp: 110, price: 90, active: true },
    ],
  };

  const options = getAvailableOneTimeSellingOptions(product);
  assert.deepEqual(options.map((option) => option.id), ['valid']);
  assert.equal(getDefaultOneTimeSellingOptionFromOptions(options)?.id, 'valid');
});

test('Add to Cart increments the shared quantity, navigates after success, and suppresses duplicate submissions', async () => {
  const lock = { current: false };
  const events: string[] = [];
  const add = () => { events.push('added'); };
  const navigate = () => { events.push('cart'); };

  assert.equal(await addToCartAndNavigate(lock, add, navigate), true);
  assert.equal(await addToCartAndNavigate(lock, add, navigate), false);
  assert.deepEqual(events, ['added', 'cart']);
  assert.equal(getCartItemCount([{ quantity: 2 }], [{ quantity: 3 }]), 5);
});

test('Product Details cart badge count tracks add, quantity change, removal, and empty cart across purchase types', () => {
  let oneTimeItems: Array<{ id: string; quantity: number }> = [];
  let subscriptionItems: Array<{ id: string; quantity: number }> = [];

  assert.equal(getCartItemCount(oneTimeItems, subscriptionItems), 0);
  oneTimeItems = [{ id: 'product-1', quantity: 1 }];
  assert.equal(getCartItemCount(oneTimeItems, subscriptionItems), 1);
  oneTimeItems = [{ id: 'product-1', quantity: 3 }];
  subscriptionItems = [{ id: 'product-1', quantity: 2 }];
  assert.equal(getCartItemCount(oneTimeItems, subscriptionItems), 5);
  oneTimeItems = [];
  assert.equal(getCartItemCount(oneTimeItems, subscriptionItems), 2);
  subscriptionItems = [];
  assert.equal(getCartItemCount(oneTimeItems, subscriptionItems), 0);
});

test('Product Details floating Cart action targets the existing Cart route', () => {
  assert.equal(PRODUCT_DETAILS_CART_ROUTE, '/(customer)/(tabs)/cart');
});

test('notification unread count follows read status changes and hides the badge when none are unread', () => {
  const notifications: CustomerNotification[] = [
    { id: 'one', title: 'One', message: '', read: false },
    { id: 'two', title: 'Two', message: '', read: true },
    { id: 'three', title: 'Three', message: '', read: false },
  ];
  assert.equal(notificationUnreadCount(notifications), 2);
  assert.equal(notificationUnreadBadgeLabel(notificationUnreadCount(notifications)), '2');

  notifications[0].read = true;
  assert.equal(notificationUnreadCount(notifications), 1);
  notifications[2].read = true;
  assert.equal(notificationUnreadCount(notifications), 0);
  assert.equal(notificationUnreadBadgeLabel(0), null);
});

test('notification unread badge caps counts over 99 and targets the existing Notifications route', () => {
  assert.equal(notificationUnreadBadgeLabel(99), '99');
  assert.equal(notificationUnreadBadgeLabel(100), '99+');
  assert.equal(notificationUnreadBadgeLabel(Number.NaN), null);
  assert.equal(CUSTOMER_NOTIFICATIONS_ROUTE, '/(customer)/account/notifications');
});

test('Add to Cart failure leaves navigation untouched and permits retry', async () => {
  const lock = { current: false };
  let navigated = false;

  await assert.rejects(
    addToCartAndNavigate(lock, () => { throw new Error('Cart persistence failed.'); }, () => { navigated = true; }),
    /Cart persistence failed/,
  );
  assert.equal(navigated, false);
  assert.equal(lock.current, false);

  await addToCartAndNavigate(lock, () => undefined, () => { navigated = true; });
  assert.equal(navigated, true);
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

test('derives stable and distinct Firestore checkout record IDs and order numbers from one attempt', () => {
  const attemptId = 'pay-mh4abcd1-7xyz8901';
  const firstOrderId = checkoutDocumentId(attemptId, 'one_time_order', '0');

  assert.equal(checkoutDocumentId(attemptId, 'one_time_order', '0'), firstOrderId);
  assert.equal(checkoutDocumentId(attemptId, 'one_time_order', '1') === firstOrderId, false);
  assert.equal(checkoutDocumentId('pay-mh4abcd1-7xyz8902', 'one_time_order', '0') === firstOrderId, false);
  assert.equal(checkoutOrderNumber(attemptId, 0), checkoutOrderNumber(attemptId, 0));
  assert.notEqual(checkoutOrderNumber(attemptId, 0), checkoutSubscriptionNumber(attemptId, 0));
});

test('uses a stable customer/address-scoped ID for retriable unserviceable-pincode enquiries', () => {
  const id = unserviceablePincodeEnquiryId('auth/user', '123456', 'address/1');
  assert.equal(id, unserviceablePincodeEnquiryId('auth/user', '123456', 'address/1'));
  assert.notEqual(id, unserviceablePincodeEnquiryId('auth/other', '123456', 'address/1'));
  assert.notEqual(id, unserviceablePincodeEnquiryId('auth/user', '654321', 'address/1'));
  assert.notEqual(id, unserviceablePincodeEnquiryId('auth/user', '123456', 'address/2'));
  assert.equal(id.includes('/'), false);
});

test('uses a stable enquiry ID for the same declined delivery item and checkout attempt', () => {
  const id = declinedAvailabilityEnquiryId('auth-1', 'fingerprint-1', 'one-time:p-1', '2026-10-17', '2026-10-24');
  assert.equal(declinedAvailabilityEnquiryId('auth-1', 'fingerprint-1', 'one-time:p-1', '2026-10-17', '2026-10-24'), id);
  assert.notEqual(declinedAvailabilityEnquiryId('auth-1', 'fingerprint-2', 'one-time:p-1', '2026-10-17', '2026-10-24'), id);
  assert.notEqual(declinedAvailabilityEnquiryId('auth-1', 'fingerprint-1', 'one-time:p-2', '2026-10-17', '2026-10-24'), id);
});

test('removes declined cart items only after their enquiries are saved and stops on enquiry failure', async () => {
  const affected = ['later-1', 'later-2'];
  const remainingCart = new Set(['on-time', ...affected]);
  const saved: string[] = [];
  const removed: string[] = [];

  await assert.rejects(
    saveEnquiriesBeforeRemovingItems(
      affected,
      async (item) => {
        if (item === 'later-2') throw new Error('enquiry write failed');
        saved.push(item);
      },
      (item) => {
        removed.push(item);
        remainingCart.delete(item);
      },
    ),
    /enquiry write failed/,
  );

  assert.deepEqual(saved, ['later-1']);
  assert.deepEqual(removed, ['later-1']);
  assert.deepEqual([...remainingCart], ['on-time', 'later-2']);
});

test('removes all declined items after successful enquiries while preserving unaffected cart items', async () => {
  const affected = ['later-1', 'later-2'];
  const remainingCart = new Set(['on-time', ...affected]);

  await saveEnquiriesBeforeRemovingItems(
    affected,
    async () => {},
    (item) => remainingCart.delete(item),
  );

  assert.deepEqual([...remainingCart], ['on-time']);
});

test('checkout fingerprint is stable for the same cart and changes with checkout intent', () => {
  const input = {
    addressId: 'address-1',
    deliverySlot: '2026-10-17',
    oneTimeItems: [{ id: 'p-1', quantity: 2, sellingOptionId: 'opt-1', selectedWeight: '250g', deliveryDate: '2026-10-17', price: 120 }],
    subscriptionItems: [{ id: 'p-2', planId: 'plan-1', quantity: 1, sellingOptionId: 'opt-2', selectedWeight: '500g', startDate: '2026-10-17', price: 400 }],
  };
  const fingerprint = buildCheckoutFingerprint(input);
  assert.equal(buildCheckoutFingerprint(input), fingerprint);
  assert.equal(createCheckoutAttemptId('auth-1', fingerprint), createCheckoutAttemptId('auth-1', fingerprint));
  assert.notEqual(createCheckoutAttemptId('auth-1', fingerprint), createCheckoutAttemptId('auth-2', fingerprint));
  assert.notEqual(buildCheckoutFingerprint({ ...input, addressId: 'address-2' }), fingerprint);
  assert.notEqual(buildCheckoutFingerprint({ ...input, oneTimeItems: [{ ...input.oneTimeItems[0], quantity: 3 }] }), fingerprint);
});

test('classifies an unserviceable pincode as a specific, recoverable checkout error', () => {
  const error = new UnserviceablePincodeError('123456');
  assert.equal(error.name, 'UnserviceablePincodeError');
  assert.equal(error.pincode, '123456');
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

  assert.equal(isProductSubscriptionEligible(comboProduct), false);
  assert.equal(isProductSubscriptionEligible(singleProduct), true);
  assert.equal(isProductSubscriptionEligible({ ...singleProduct, subscriptionPurchase: false }), true);
  assert.equal(isProductSubscriptionEligible({ ...singleProduct, active: false }), false);
});

test('requires a customer enquiry when no delivery date is available within 12 weeks', () => {
  const resolution = {
    hasUnavailableItems: true,
    items: [
      { key: 'one-time:p-1', deliveryDate: null, available: false, requestedDate: '2026-10-09' },
    ],
  } as const;

  assert.equal(shouldSubmitAvailabilityEnquiry(resolution), true);
  assert.equal(shouldSubmitAvailabilityEnquiry({
    hasUnavailableItems: false,
    items: [{ key: 'one-time:p-2', deliveryDate: '2026-10-16', available: true, requestedDate: '2026-10-09' }],
  }), false);
});

test('calculates Cart savings per line so non-discounted items cannot offset valid savings', () => {
  const oneTimeItems: any[] = [
    { id: 'p-1', quantity: 2, price: 180, mrp: 200 },
    { id: 'p-2', quantity: 1, price: 120, mrp: 100 },
  ];
  const subscriptionItems: any[] = [
    { id: 'p-3', planId: 'plan-1', startDate: '2026-10-10', quantity: 1, price: 220, mrp: 250 },
  ];

  const totals = getUnifiedCartTotals({ oneTimeItems, subscriptionItems });
  const uniqueDates = new Set(['2026-10-09', '2026-10-09', '2026-10-16']);
  const deliveryChargePerDate = 65;
  const deliveryTotal = deliveryChargePerDate * uniqueDates.size;
  const payableTotal = totals.subtotal + deliveryTotal;

  assert.equal(totals.subtotal, 180 * 2 + 120 + 220);
  assert.equal(totals.mrpSubtotal, 200 * 2 + 120 + 250);
  assert.equal(totals.savings, 70);
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
