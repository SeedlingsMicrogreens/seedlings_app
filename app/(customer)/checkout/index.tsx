import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { AppCard, Button, PageTitle, Screen, TextAction } from '../../../components/UI';
import { colors, radius, spacing } from '../../../constants/theme';
import { useAppStore } from '../../../store/appStore';
import { getUnifiedCartTotals, type CartItem, type SubscriptionCartItem } from '../../../services/cart/cartService';
import { getCustomerAddresses, type CustomerAddress } from '../../../services/customerAddresses';
import { nextWeekSaturday, resolveCartDeliveryDates, shouldSubmitAvailabilityEnquiry } from '../../../services/orders/customerOrderAvailability';
import { allocateUniqueDeliveryDateChargeGroups, calculateUniqueDateCheckoutDeliveryCharges, buildSubscriptionDeliveryDates, UnserviceablePincodeError, type UniqueDateCheckoutDeliveryCharges } from '../../../services/orders/deliveryChargeService';
import { getCachedProducts, getProducts } from '../../../services/products/productService';
import { assertPaymentAttemptOwnership, createCustomerMixedCheckout } from '../../../services/orders/mixedCheckoutService';
import { submitHighDemandEnquiries } from '../../../services/orders/customerEnquiryService';
import { submitAvailabilityContactRequest, submitUnserviceablePincodeEnquiry } from '../../../services/orders/customerContactRequestService';
import { createCashfreePaymentSession, persistCashfreePaymentAttempt, startCashfreePayment, verifyCashfreePayment } from '../../../services/payments/paymentService';
import { clearPendingPaymentAttempt, replacePendingPaymentAttempt, type PendingPaymentAttempt } from '../../../services/payments/paymentAttemptStore';
import { calculateCheckoutPayableDeliveryCharge, calculateCheckoutPayableProductSubtotal, calculateCheckoutPayableTotal, calculateCustomerOffers, NO_OFFERS, roundCheckoutMoney, type CheckoutOfferResult, type SubscriptionDeliveryEntitlement } from '../../../services/orders/customerOffers';
import { checkoutSavingsBreakdown, formatCheckoutAmount } from '../../../services/orders/checkoutSavings';
import { resolvePriceDisplay, scalePriceDisplay } from '../../../services/products/priceDisplay';
import { parseWeightGrams } from '../../../services/orders/weightUtils';
import { buildCheckoutFingerprint, declinedAvailabilityEnquiryId } from '../../../services/orders/checkoutAttemptUtils';
import { saveEnquiriesBeforeRemovingItems } from '../../../services/orders/declinedDeliveryEnquiry';
import { auth } from '../../../services/core/firebaseClient';

const CHECKOUT_VALIDATION_TIMEOUT_MS = 30_000;

function formatAddress(address: CustomerAddress) {
  return [address.addressLine1, address.addressLine2, address.landmark, address.city, address.state, address.pincode].filter(Boolean).join(', ');
}

function money(value: number) {
  return formatCheckoutAmount(Number(value) || 0);
}

function formatDeliveryDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function weightLabel(item: CartItem) {
  return item.selectedWeight || 'Pack';
}

function regularDeliveriesFor(item: SubscriptionCartItem) {
  const configured = Number(item.deliveriesPerTerm);
  if (Number.isSafeInteger(configured) && configured > 0) return configured;
  const frequency = String(item.frequency ?? '').toLowerCase();
  return frequency === 'monthly' ? 4 : frequency === 'quarterly' ? 12 : 1;
}

function deliverySlotForCart(cart: CartItem[], subscriptions: SubscriptionCartItem[]) {
  return [
    ...cart.map((item) => item.deliveryDate || nextWeekSaturday()),
    ...subscriptions.map((item) => item.deliveryDate || item.startDate || nextWeekSaturday()),
  ].sort()[0] || nextWeekSaturday();
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

type CheckoutLine = {
  key: string;
  kind: 'one-time' | 'subscription';
  item: CartItem | SubscriptionCartItem;
  dates: string[];
};

export default function Checkout() {
  const cart = useAppStore((s) => s.cart);
  const subscriptionCart = useAppStore((s) => s.subscriptionCart);
  const mobile = useAppStore((s) => s.mobile);
  const totals = useMemo(() => getUnifiedCartTotals({ oneTimeItems: cart, subscriptionItems: subscriptionCart }), [cart, subscriptionCart]);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const [addressError, setAddressError] = useState('');
  const [validationError, setValidationError] = useState('');
  const [unserviceablePincode, setUnserviceablePincode] = useState('');
  const [pincodeEnquiryError, setPincodeEnquiryError] = useState('');
  const [submittingPincodeEnquiry, setSubmittingPincodeEnquiry] = useState(false);
  const [validating, setValidating] = useState(false);
  const [deliveryCharges, setDeliveryCharges] = useState<UniqueDateCheckoutDeliveryCharges | null>(null);
  const [chargeLoading, setChargeLoading] = useState(true);
  const [checkoutLines, setCheckoutLines] = useState<CheckoutLine[]>([]);
  const [offerResult, setOfferResult] = useState<CheckoutOfferResult>(NO_OFFERS);
  const [subscriptionEntitlements, setSubscriptionEntitlements] = useState<SubscriptionDeliveryEntitlement[]>([]);
  const paymentInFlight = useRef(false);
  const pincodeEnquiryInFlight = useRef(false);

  const loadAddresses = useCallback(async () => {
    if (!mobile) return;
    setLoadingAddresses(true);
    setAddressError('');
    try {
      const result = await getCustomerAddresses(mobile);
      setAddresses(result);
      setSelectedAddressId((current) => result.some((item) => item.id === current) ? current : result[0]?.id ?? '');
    } catch (error) {
      setAddressError(error instanceof Error ? error.message : 'Unable to load your addresses.');
    } finally {
      setLoadingAddresses(false);
    }
  }, [mobile]);

  useFocusEffect(useCallback(() => { void loadAddresses(); }, [loadAddresses]));

  const buildCheckoutLines = useCallback((items: CartItem[], subscriptions: SubscriptionCartItem[]) => {
    const oneTimeLines: CheckoutLine[] = items.map((item) => ({
      key: `one-time:${item.id}`,
      kind: 'one-time',
      item,
      dates: item.deliveryDate ? [item.deliveryDate] : [nextWeekSaturday()],
    }));
    const subscriptionLines: CheckoutLine[] = subscriptions.map((item) => ({
      key: `subscription:${item.id}:${item.planId}:${item.startDate}`,
      kind: 'subscription',
      item,
      dates: [item.deliveryDate || item.startDate || nextWeekSaturday()],
    }));
    return [...oneTimeLines, ...subscriptionLines];
  }, []);

  const loadDeliveryCharge = useCallback(async () => {
    const selected = addresses.find((item) => item.id === selectedAddressId);
    const pincode = String(selected?.pincode ?? '').replace(/\D/g, '');
    setChargeLoading(true);
    setDeliveryCharges(null);
    setOfferResult(NO_OFFERS);
    setSubscriptionEntitlements([]);
    setUnserviceablePincode('');
    setPincodeEnquiryError('');
    setCheckoutLines(buildCheckoutLines(cart, subscriptionCart));
    if (!/^\d{6}$/.test(pincode)) {
      setChargeLoading(false);
      return;
    }
    try {
      const lines = buildCheckoutLines(cart, subscriptionCart);
      const result = await calculateUniqueDateCheckoutDeliveryCharges({
        pincode,
        oneTimeDates: cart.map((item) => item.deliveryDate || nextWeekSaturday()),
        subscriptionDates: subscriptionCart.flatMap((item) =>
          buildSubscriptionDeliveryDates(item.deliveryDate || item.startDate || nextWeekSaturday(), regularDeliveriesFor(item)),
        ),
      });
      const geoId = result.charges[0]?.sourceId ?? '';
      const locationName = result.charges[0]?.sourceName ?? '';
      const offers = await calculateCustomerOffers({
        pincode,
        geoId,
        locationName,
        oneTimeItems: cart.map((item) => ({ price: Number(item.price || 0), quantity: Number(item.quantity || 0) })),
        subscriptionItems: subscriptionCart.map((item) => ({ price: Number(item.price || 0), quantity: Number(item.quantity || 0) })),
        deliveryChargeAmounts: result.charges.map((charge) => charge.charge),
        subscriptions: subscriptionCart.map((item) => ({
          frequency: item.frequency ?? '',
          regularDeliveries: regularDeliveriesFor(item),
          pincode,
          geoId,
          locationName,
        })),
      });
      setCheckoutLines(lines);
      setDeliveryCharges(result);
      setOfferResult(offers);
      setSubscriptionEntitlements(offers.subscriptionEntitlements);
    } catch (error) {
      if (error instanceof UnserviceablePincodeError) {
        setUnserviceablePincode(error.pincode);
        setValidationError('');
      } else {
        setValidationError(error instanceof Error ? error.message : 'Unable to calculate delivery charges.');
      }
    } finally {
      setChargeLoading(false);
    }
  }, [addresses, selectedAddressId, cart, subscriptionCart, buildCheckoutLines]);

  useEffect(() => { void loadDeliveryCharge(); }, [loadDeliveryCharge]);

  const selectedAddress = addresses.find((item) => item.id === selectedAddressId);
  const payableProductSubtotal = calculateCheckoutPayableProductSubtotal(totals.subtotal, offerResult.priceSavings);
  const finalDeliveryCharge = calculateCheckoutPayableDeliveryCharge(deliveryCharges?.total ?? 0, offerResult.deliverySavings);
  const checkoutTotal = calculateCheckoutPayableTotal(totals.subtotal, deliveryCharges?.total ?? 0, offerResult);
  const deliveryChargeGroups = allocateUniqueDeliveryDateChargeGroups({
    oneTimeDates: cart.map((item) => item.deliveryDate || nextWeekSaturday()),
    subscriptions: subscriptionCart.map((item) => ({
      label: item.planName || item.frequency || 'Subscription',
      deliveryDates: buildSubscriptionDeliveryDates(
        item.deliveryDate || item.startDate || nextWeekSaturday(),
        regularDeliveriesFor(item),
      ),
    })),
  });

  const completePaidAttempt = async (attemptId: string, orderNumber: string, total: number) => {
    useAppStore.getState().clearCart();
    await clearPendingPaymentAttempt(attemptId);
    router.replace({ pathname: '/(customer)/checkout/success', params: { orderNumber, total: String(total) } });
  };

  const continuePaymentAttempt = async (attempt: PendingPaymentAttempt) => {
    await assertPaymentAttemptOwnership(attempt, mobile);
    if (attempt.cashfreeOrderId) {
      const verification = await verifyCashfreePayment(attempt.cashfreeOrderId);
      if (verification.status === 'paid') {
        await completePaidAttempt(attempt.paymentAttemptId, attempt.primaryOrderNumber, attempt.total);
        return;
      }
      if (verification.status === 'pending') {
        if (verification.inProgress) {
          router.replace('/(customer)/checkout/payment-status');
          return;
        }
      }
    }

    const session = await createCashfreePaymentSession(attempt.orderIds, mobile);
    if (roundCheckoutMoney(session.amount) !== roundCheckoutMoney(attempt.total)) {
      throw new Error(`Payment amount mismatch. Checkout total is ${money(attempt.total)} but Cashfree received ${money(session.amount)}.`);
    }
    await persistCashfreePaymentAttempt({
      ...attempt,
      cashfreeOrderId: session.cashfreeOrderId,
      total: roundCheckoutMoney(session.amount),
    });

    const paymentResult = await startCashfreePayment(session);
    if (paymentResult.status === 'paid') {
      await completePaidAttempt(attempt.paymentAttemptId, attempt.primaryOrderNumber, roundCheckoutMoney(session.amount));
      return;
    }
    if (paymentResult.status === 'failed') {
      Alert.alert('Payment failed', paymentResult.message || 'Your payment was not completed. You can retry from this checkout or the order detail page.');
      return;
    }
    router.replace('/(customer)/checkout/payment-status');
  };

  const sendUnserviceablePincodeEnquiry = async () => {
    if (pincodeEnquiryInFlight.current || !unserviceablePincode || !selectedAddress || !mobile) return;
    pincodeEnquiryInFlight.current = true;
    setSubmittingPincodeEnquiry(true);
    setPincodeEnquiryError('');
    try {
      await submitUnserviceablePincodeEnquiry({
        mobile,
        pincode: unserviceablePincode,
        addressId: selectedAddress.id,
        address: selectedAddress as unknown as Record<string, unknown>,
        items: [...cart, ...subscriptionCart].map((item) => ({
          productId: item.id,
          productName: item.name,
          quantity: item.quantity,
          selectedWeight: item.selectedWeight || '',
          deliveryDate: item.deliveryDate,
        })),
      });
      Alert.alert('Enquiry submitted', 'Your delivery-area enquiry was saved. No order or payment was created.');
    } catch (error) {
      setPincodeEnquiryError(error instanceof Error ? error.message : 'Unable to submit your enquiry. Please try again.');
    } finally {
      pincodeEnquiryInFlight.current = false;
      setSubmittingPincodeEnquiry(false);
    }
  };

  const validateCheckout = async () => {
    if (paymentInFlight.current || validating) return;
    paymentInFlight.current = true;
    setValidationError('');
    if (unserviceablePincode) {
      setValidationError(`Pincode ${unserviceablePincode} is not serviceable, so checkout and payment cannot continue.`);
      paymentInFlight.current = false;
      return;
    }
    if (cart.length === 0 && subscriptionCart.length === 0) {
      setValidationError('Your cart is empty.');
      paymentInFlight.current = false;
      return;
    }
    if (!selectedAddress) {
      setValidationError('Please select a delivery address.');
      paymentInFlight.current = false;
      return;
    }
    if (!mobile) {
      setValidationError('Customer session not found. Please log in again.');
      paymentInFlight.current = false;
      return;
    }
    if (chargeLoading || !deliveryCharges) {
      setValidationError('Delivery charge is still loading. Please try again.');
      paymentInFlight.current = false;
      return;
    }

    setValidating(true);
    try {
      // A previous unpaid checkout is resolved by the server checkout claim during
      // order creation (same cart resumes it; a changed cart replaces it).

      // Re-read current products before allowing the customer to continue.
      // This is a checkout validation only; it does not reserve inventory.
      let products;
      try {
        ({ products } = await withTimeout(
          getProducts({ forceRefresh: true }),
          CHECKOUT_VALIDATION_TIMEOUT_MS,
          'Product availability check is taking too long. Please check your internet connection and try again.',
        ));
      } catch (error) {
        const cachedProducts = getCachedProducts();
        if (!cachedProducts.length) throw error;
        products = cachedProducts;
      }

      const productMap = new Map(products.map((product) => [product.id, product]));
      const availabilityItems = [
        ...cart.map((item) => ({
          key: `one-time:${item.id}`,
          kind: 'one-time' as const,
          item,
          product: productMap.get(item.id),
          requestedDate: item.deliveryDate || nextWeekSaturday(),
        })),
        ...subscriptionCart.map((item) => ({
          key: `subscription:${item.id}:${item.planId}:${item.startDate}`,
          kind: 'subscription' as const,
          item,
          product: productMap.get(item.id),
          requestedDate: item.deliveryDate || item.startDate || nextWeekSaturday(),
        })),
      ];

      for (const entry of availabilityItems) {
        if (!entry.product || !entry.product.active) {
          throw new Error(`Product "${entry.item.name}" is no longer available.`);
        }
      }

      const resolution = await withTimeout(
        resolveCartDeliveryDates(
          availabilityItems.map((entry) => ({
            key: entry.key,
            kind: entry.kind,
            product: entry.product!,
            quantity: entry.item.quantity,
            packagingGrams: parseWeightGrams(entry.item.selectedWeight, 0),
            requestedDate: entry.requestedDate,
            name: entry.item.name,
          })),
          { maxWeeks: 12 },
        ),
        CHECKOUT_VALIDATION_TIMEOUT_MS * 2,
        'Product availability check is taking too long. Please check your internet connection and try again.',
      );

      const highDemandItems = resolution.items.filter((item) => item.highDemand);
      if (highDemandItems.length) {
        const sendEnquiry = await new Promise<boolean>((resolve) => Alert.alert(
          'High demand',
          'One or more selected products are currently above the production threshold. No order or payment will be created. Would you like our team to contact you?',
          [
            { text: 'No', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Send Enquiry', onPress: () => resolve(true) },
          ],
          { cancelable: false },
        ));
        if (sendEnquiry) {
          await submitHighDemandEnquiries({
            mobile,
            address: selectedAddress as unknown as Record<string, unknown>,
            items: highDemandItems.map((item) => {
              const cartItem = [...cart, ...subscriptionCart].find((candidate) => item.key.includes(candidate.id));
              return { productId: item.productId, productName: item.name, requestedGrams: parseWeightGrams(cartItem?.selectedWeight, 0) * Number(cartItem?.quantity || 1), requestedDeliveryDate: item.requestedDate, thresholdGrams: item.thresholdGrams || 0 };
            }),
          });
          Alert.alert('Enquiry submitted', 'Your enquiry has been submitted. Our team will contact you.');
        }
        return;
      }
      if (resolution.hasUnavailableItems) {
        if (shouldSubmitAvailabilityEnquiry(resolution)) {
          const unavailableItems = resolution.items.filter((item) => !item.deliveryDate);
          for (const unavailable of unavailableItems) {
            const cartItem = [...cart, ...subscriptionCart].find((candidate) => unavailable.key.includes(candidate.id));
            await submitAvailabilityContactRequest({
              mobile,
              productId: unavailable.productId,
              productName: unavailable.name,
              requestedGrams: (Number(cartItem?.selectedWeight?.replace(/[^0-9.]/g, '')) || 0) * Number(cartItem?.quantity || 1),
              requestedDeliveryDate: unavailable.requestedDate,
              address: selectedAddress as unknown as Record<string, unknown>,
            });
          }
          Alert.alert('No delivery window available', 'No delivery date is available within the next 12 weeks for the selected items. Our team has been notified and will contact you.');
          return;
        }
        throw new Error('The complete requested quantity is no longer available on the selected delivery date. Please return to Cart and review availability.');
      }

      const deliverySlot = deliverySlotForCart(cart, subscriptionCart);
      const authUid = auth.currentUser?.uid;
      if (!authUid) throw new Error('Your login session expired. Please sign in again.');
      const checkoutFingerprint = buildCheckoutFingerprint({
        addressId: selectedAddress.id,
        deliverySlot,
        oneTimeItems: cart,
        subscriptionItems: subscriptionCart,
      });

      const changedDates = resolution.items.filter((item) => item.deliveryDate && item.deliveryDate !== item.requestedDate);
      if (changedDates.length) {
        const rows = changedDates.map((item) => `${item.name}: ${item.requestedDate} → ${item.deliveryDate}`).join('\n');
        const acceptDates = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Delivery date updated',
            `The complete quantity is not available on the originally selected date. Partial delivery will not be made.\n\n${rows}\n\nContinue with the updated delivery date?`,
            [
              { text: 'No, contact me', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Yes, continue', onPress: () => resolve(true) },
            ],
            { cancelable: false },
          );
        });
        if (!acceptDates) {
          const affectedItems = changedDates.map((changed) => {
            if (changed.kind === 'subscription') {
              const cartItem = subscriptionCart.find((candidate) => `subscription:${candidate.id}:${candidate.planId}:${candidate.startDate}` === changed.key);
              if (!cartItem) throw new Error(`Could not match ${changed.name} to the current cart. No cart items were removed.`);
              return { changed, cartItem, kind: 'subscription' as const };
            }
            const cartItem = cart.find((candidate) => `one-time:${candidate.id}` === changed.key);
            if (!cartItem) throw new Error(`Could not match ${changed.name} to the current cart. No cart items were removed.`);
            return { changed, cartItem, kind: 'one-time' as const };
          });
          await saveEnquiriesBeforeRemovingItems(
            affectedItems,
            async ({ changed, cartItem }) => {
              await submitAvailabilityContactRequest({
                mobile,
                productId: changed.productId,
                productName: changed.name,
                requestedGrams: parseWeightGrams(cartItem.selectedWeight, 0) * cartItem.quantity,
                requestedDeliveryDate: changed.requestedDate,
                resolvedDeliveryDate: changed.deliveryDate || undefined,
                address: selectedAddress as unknown as Record<string, unknown>,
                requestId: declinedAvailabilityEnquiryId(
                  authUid,
                  checkoutFingerprint,
                  changed.key,
                  changed.requestedDate,
                  changed.deliveryDate || '',
                ),
              });
            },
            ({ kind, cartItem }) => {
              if (kind === 'subscription') {
                useAppStore.getState().removeSubscriptionFromCart(cartItem.id, cartItem.planId, cartItem.startDate);
              } else {
                useAppStore.getState().removeFromCart(cartItem.id);
              }
            },
          );
          router.replace('/(customer)/(tabs)/cart');
          Alert.alert(
            'Enquiry submitted',
            useAppStore.getState().cart.length + useAppStore.getState().subscriptionCart.length
              ? 'Enquiries were saved for the declined delivery-date items. Other items remain in your cart.'
              : 'Enquiries were saved and the declined items were removed. Your cart is now empty.',
          );
          return;
        }

        const resolvedDates: Record<string, string | null> = {};
        for (const item of resolution.items) resolvedDates[item.key] = item.deliveryDate;
        useAppStore.getState().applyCartDeliveryDates(resolvedDates);
        await loadDeliveryCharge();
        return;
      }

      // The server checkout claim decides whether these are new orders or the
      // customer's existing pending orders for the same purchase; a changed cart
      // has the previous unpaid orders cancelled before new ones are written.
      const paymentAttempt = await createCustomerMixedCheckout({
        mobile,
        addressId: selectedAddress.id,
        deliverySlot,
        checkoutFingerprint,
        paymentMethod: 'online',
        oneTimeItems: useAppStore.getState().cart,
        subscriptionItems: useAppStore.getState().subscriptionCart,
      });

      const orderIds = [
        ...(paymentAttempt.paymentOrderIds.length ? paymentAttempt.paymentOrderIds : [paymentAttempt.oneTimeOrderId, ...paymentAttempt.subscriptionOrderIds]),
      ].filter(Boolean);
      if (!orderIds.length) throw new Error('No pending order was created for payment.');

      const paymentRecord: PendingPaymentAttempt = {
        paymentAttemptId: paymentAttempt.paymentAttemptId,
        ...(paymentAttempt.cashfreeOrderId ? { cashfreeOrderId: paymentAttempt.cashfreeOrderId } : {}),
        orderIds,
        primaryOrderId: paymentAttempt.primaryOrderId,
        primaryOrderNumber: paymentAttempt.primaryOrderNumber,
        total: paymentAttempt.total,
        createdAt: Date.now(),
        // Resumed orders may come from an earlier session or the Website; their
        // ownership is checked by UID and customer only.
        ...(paymentAttempt.resumed ? {} : { checkoutFingerprint }),
        authUid,
      };
      await replacePendingPaymentAttempt(paymentRecord);
      await continuePaymentAttempt(paymentRecord);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Unable to validate checkout. Please try again.');
    } finally {
      setValidating(false);
      paymentInFlight.current = false;
    }
  };

  const oneTimeLines = checkoutLines.filter((line) => line.kind === 'one-time');
  const subscriptionLines = checkoutLines.filter((line) => line.kind === 'subscription');
  const mrpSavings = cart.reduce((sum, item) =>
    sum + (scalePriceDisplay(resolvePriceDisplay(item.price, item.mrp), item.quantity).savings ?? 0), 0);
  const subscriptionPlanSavings = subscriptionCart.reduce((sum, item) =>
    sum + (scalePriceDisplay(resolvePriceDisplay(item.price, item.mrp), item.quantity).savings ?? 0), 0);
  const savings = checkoutSavingsBreakdown({
    mrpSavings,
    priceOfferSavings: offerResult.priceSavings,
    subscriptionPlanSavings,
    deliverySavings: offerResult.deliverySavings,
  });
  const priceOfferName = String(offerResult.priceOffer?.name ?? '').trim().replace(/\s+/g, ' ');
  const deliveryOfferName = String(offerResult.deliveryOffer?.name ?? '').trim().replace(/\s+/g, ' ');
  const offerLabel = (name: string, fallback: string) =>
    `${name || fallback}${/offer$/i.test(name) ? '' : ' offer'}`;
  const productSavingsBreakdown = [
    savings.mrpSavings > 0 ? `${money(savings.mrpSavings)} MRP savings` : '',
    savings.priceOfferSavings > 0 ? `${money(savings.priceOfferSavings)} offer savings` : '',
  ].filter(Boolean).join(' + ');

  const renderPurchase = (line: CheckoutLine) => {
    const item = line.item;
    const referenceDisplay = scalePriceDisplay(resolvePriceDisplay(item.price, item.mrp), item.quantity);
    const itemPrice = item.price * item.quantity;
    const peerLines = line.kind === 'one-time' ? oneTimeLines : subscriptionLines;
    const peerIndex = peerLines.findIndex((peer) => peer.key === line.key);
    // Offers are earned per cart line (shared checkoutPricing rule), in cart order.
    const allocatedOfferSaving = (line.kind === 'one-time' ? offerResult.oneTimeItemSavings : offerResult.subscriptionItemSavings)[peerIndex] ?? 0;
    const finalItemPrice = Math.max(0, itemPrice - allocatedOfferSaving);
    const firstDate = line.dates[0] || nextWeekSaturday();
    const subscriptionIndex = line.kind === 'subscription'
      ? subscriptionCart.findIndex((entry) => entry.id === item.id
        && entry.planId === (item as SubscriptionCartItem).planId
        && entry.startDate === (item as SubscriptionCartItem).startDate)
      : -1;
    const entitlement = subscriptionEntitlements[subscriptionIndex];

    return (
      <AppCard key={line.key} style={styles.purchaseCard}>
        <View style={styles.purchaseTop}>
          <View style={styles.purchaseInfo}>
            <Text style={styles.purchaseName}>{item.name} × {item.quantity}</Text>
            <Text style={styles.purchaseMeta}>
              {weightLabel(item)} · {line.kind === 'subscription' ? (item as SubscriptionCartItem).planName : 'One-time'}
            </Text>
          </View>
          <View style={styles.purchasePriceStack}>
            {referenceDisplay.originalPrice !== undefined ? (
              <Text style={styles.purchaseMrp}>
                {line.kind === 'one-time' ? 'MRP ' : ''}{money(referenceDisplay.originalPrice)}
              </Text>
            ) : null}
            {allocatedOfferSaving > 0 ? (
              <View style={styles.purchaseOfferPrice}>
                <Text style={styles.purchaseMrp}>{money(itemPrice)}</Text>
                <Text style={styles.purchaseSale}>{money(finalItemPrice)}</Text>
              </View>
            ) : (
              <Text style={styles.purchaseSale}>{money(itemPrice)}</Text>
            )}
          </View>
        </View>
        <Text style={styles.deliveryText}>Delivery: {formatDeliveryDate(firstDate)}</Text>
        {line.kind === 'subscription' && entitlement ? (
          <Text style={styles.subscriptionOfferText}>
            {entitlement.bonusDeliveries > 0
              ? `${String(entitlement.offer?.name ?? 'Subscription offer')} · +${entitlement.bonusDeliveries} bonus deliveries · ${entitlement.totalDeliveries} deliveries total`
              : `${entitlement.regularDeliveries} deliveries total`}
          </Text>
        ) : null}
      </AppCard>
    );
  };

  return (
    <Screen>
      <PageTitle title="Checkout" subtitle="Review your order before payment" />

      <Text style={styles.sectionTitle}>Delivery address</Text>
      {loadingAddresses ? (
        <AppCard style={styles.stateCard}><ActivityIndicator color={colors.greenDark} /><Text style={styles.muted}>Loading your addresses…</Text></AppCard>
      ) : addresses.length === 0 ? (
        <AppCard style={styles.addressCard}>
          <Text style={styles.addressTitle}>No saved address</Text>
          <Text style={styles.muted}>Add a delivery address before continuing.</Text>
          <View style={styles.addAddressAction}><Button title="Add Address" onPress={() => router.push('/(customer)/account/addresses')} /></View>
        </AppCard>
      ) : (
        <AppCard style={styles.addressCard}>
          <View style={styles.addressHeader}>
            <Text style={styles.addressTitle}>{selectedAddress?.label || 'Delivery address'}</Text>
            <TextAction label="Change" accessibilityLabel="Change delivery address" onPress={() => router.push('/(customer)/account/addresses')} />
          </View>
          {selectedAddress?.name ? <Text style={styles.addressName}>{selectedAddress.name}</Text> : null}
          {selectedAddress ? <Text style={styles.muted}>{formatAddress(selectedAddress)}</Text> : null}
        </AppCard>
      )}

      {subscriptionLines.length > 0 ? (
        <View>
          <Text style={styles.sectionTitle}>Subscriptions</Text>
          {subscriptionLines.map(renderPurchase)}
        </View>
      ) : null}

      {oneTimeLines.length > 0 ? (
        <View>
          <Text style={styles.sectionTitle}>One-time purchases</Text>
          {oneTimeLines.map(renderPurchase)}
        </View>
      ) : null}

      <View style={styles.summarySection}>
        <Text style={styles.sectionTitle}>Order summary</Text>
        <AppCard style={styles.summaryCard}>
          <View style={styles.summaryLine}>
            <Text style={styles.summaryLabel}>Product subtotal</Text>
            <Text style={styles.summaryValue}>{money(payableProductSubtotal)}</Text>
          </View>
          <View style={styles.deliverySummaryLine}>
            <View style={styles.deliverySummaryHeader}>
              <Text style={styles.summaryLabel}>Delivery charge</Text>
              <View style={styles.summaryAmount}>
                {offerResult.deliverySavings > 0 && deliveryCharges ? (
                  <Text style={styles.purchaseMrp}>{money(deliveryCharges.total)}</Text>
                ) : null}
                <Text style={offerResult.deliverySavings > 0 ? styles.discountedSummaryValue : styles.summaryValue}>
                  {chargeLoading ? 'Calculating…' : money(finalDeliveryCharge)}
                </Text>
              </View>
            </View>
            {deliveryCharges && deliveryCharges.dates.length > 0 ? (
              <Text style={styles.chargeNote}>
                {deliveryChargeGroups.oneTimeDeliveryCount > 0
                  ? `${money(deliveryCharges.chargePerDate)} × ${deliveryChargeGroups.oneTimeDeliveryCount} one-time delivery dates`
                  : ''}
                {deliveryChargeGroups.oneTimeDeliveryCount > 0 && deliveryChargeGroups.subscriptions.some((group) => group.deliveryCount > 0) ? ' · ' : ''}
                {deliveryChargeGroups.subscriptions
                  .filter((group) => group.deliveryCount > 0)
                  .map((group) => `${group.label} · ${money(deliveryCharges.chargePerDate)} × ${group.deliveryCount} delivery dates`)
                  .join(' · ')}
              </Text>
            ) : null}
          </View>
          {deliveryCharges && savings.productSavings > 0 && (savings.priceOfferSavings > 0 || savings.mrpSavings > 0) ? (
            <View style={styles.savingsCard}>
              <Text style={styles.savingsCardTitle}>
                🎉 You saved {money(savings.productSavings)} {savings.priceOfferSavings > 0
                  ? `with the ${offerLabel(priceOfferName, 'Price Offer')}!`
                  : 'on product pricing!'}
              </Text>
              {productSavingsBreakdown ? <Text style={styles.savingsBreakdown}>{productSavingsBreakdown}</Text> : null}
            </View>
          ) : null}
          {deliveryCharges && savings.deliverySavings > 0 ? (
            <View style={styles.savingsCard}>
              <Text style={styles.savingsCardTitle}>
                🎉 You saved {money(savings.deliverySavings)} with the {offerLabel(deliveryOfferName, 'Delivery Charge')}!
              </Text>
            </View>
          ) : null}
          {deliveryCharges && savings.subscriptionPlanSavings > 0 ? (
            <View style={styles.savingsCard}>
              <Text style={styles.savingsCardTitle}>
                🎉 You saved {money(savings.subscriptionPlanSavings)} on subscription plans!
              </Text>
            </View>
          ) : null}
          {deliveryCharges && savings.totalSavings > 0 ? (
            <View style={styles.totalSavingsCard}>
              <Text style={styles.totalSavingsLabel}>🎉 You saved a total of</Text>
              <Text style={styles.totalSavingsAmount}>{money(savings.totalSavings)}</Text>
            </View>
          ) : null}
          <View style={styles.totalLine}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.total}>{money(checkoutTotal)}</Text>
          </View>
        </AppCard>
      </View>

      {addressError ? <Text style={styles.error}>{addressError}</Text> : null}
      {validationError ? <Text style={styles.error}>{validationError}</Text> : null}
      {unserviceablePincode ? (
        <View style={styles.pincodeEnquiry}>
          <Text style={styles.pincodeEnquiryTitle}>Delivery is not currently available for {unserviceablePincode}</Text>
          <Text style={styles.muted}>Send us an enquiry and our team can follow up. Checkout and payment will remain unavailable for this address.</Text>
          <View style={styles.pincodeEnquiryButton}>
            <Button title="Send delivery enquiry" loading={submittingPincodeEnquiry} onPress={() => void sendUnserviceablePincodeEnquiry()} />
          </View>
          {pincodeEnquiryError ? <Text style={styles.error}>{pincodeEnquiryError}</Text> : null}
        </View>
      ) : null}
      {validating ? <View style={styles.progressCard}><ActivityIndicator color={colors.greenDark} /><Text style={styles.progressText}>Validating checkout…</Text></View> : null}
      <View style={styles.paymentButtonWrap}>
        <Button title="Continue to Payment" loading={validating} accessibilityLabel={validating ? 'Validating checkout' : 'Continue to Payment'} onPress={validateCheckout} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 18, fontWeight: '900', color: colors.ink, marginTop: 18, marginBottom: spacing.sm },
  addressCard: { padding: 14, marginBottom: 2 },
  addressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addressTitle: { fontSize: 14, fontWeight: '900', color: colors.ink },
  addressName: { fontSize: 13, fontWeight: '800', color: colors.ink, marginTop: 7 },
  addAddressAction: { marginTop: spacing.md },
  stateCard: { padding: 18, marginBottom: 2, alignItems: 'center', gap: spacing.sm },
  purchaseCard: { padding: 13, marginBottom: spacing.sm },
  purchaseTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  purchaseInfo: { flex: 1, minWidth: 0 },
  purchaseName: { fontSize: 14, fontWeight: '900', color: colors.ink },
  purchaseMeta: { fontSize: 11, color: colors.inkSoft, marginTop: 4 },
  purchasePriceStack: { alignItems: 'flex-end', gap: 2 },
  purchaseOfferPrice: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  purchaseMrp: { color: colors.inkFaint, fontSize: 11, textDecorationLine: 'line-through' },
  purchaseSale: { color: colors.greenDark, fontSize: 14, fontWeight: '900' },
  deliveryText: { color: colors.inkSoft, fontSize: 11, marginTop: spacing.sm },
  subscriptionOfferText: { color: colors.greenDark, fontSize: 11, fontWeight: '800', marginTop: 5 },
  summarySection: { marginTop: 2 },
  summaryCard: { paddingHorizontal: 14, paddingTop: 7, paddingBottom: spacing.md },
  summaryLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  deliverySummaryLine: { gap: 4, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  deliverySummaryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  summaryLabel: { color: colors.inkSoft, fontSize: 12 },
  summaryValue: { color: colors.inkSoft, fontSize: 12 },
  discountedSummaryValue: { color: colors.greenDark, fontSize: 12, fontWeight: '900' },
  summaryAmount: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  saving: { color: colors.greenDark, fontSize: 12, fontWeight: '900' },
  savingsCard: { backgroundColor: colors.greenTint, borderRadius: radius.md, padding: 10, marginTop: 4, marginBottom: 4 },
  savingsCardTitle: { color: colors.greenDark, fontSize: 12, fontWeight: '900', lineHeight: 17 },
  savingsBreakdown: { color: colors.greenDark, fontSize: 10, lineHeight: 15, marginTop: 3 },
  totalSavingsCard: { alignItems: 'center', backgroundColor: colors.greenTint, borderRadius: radius.md, padding: 12, marginTop: spacing.sm },
  totalSavingsLabel: { color: colors.greenDark, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  totalSavingsAmount: { color: colors.greenDark, fontSize: 18, fontWeight: '900', marginTop: 2 },
  chargeNote: { color: colors.inkSoft, fontSize: 10, lineHeight: 15 },
  totalLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 13 },
  totalLabel: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  total: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  muted: { color: colors.inkSoft, marginTop: 4, lineHeight: 18, fontSize: 12 },
  error: { color: colors.danger, fontSize: 13, fontWeight: '700', marginVertical: 6 },
  progressCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.panel, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineSoft, padding: 10, marginBottom: 10 },
  progressText: { color: colors.inkSoft, fontSize: 13, fontWeight: '700' },
  pincodeEnquiry: { marginTop: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel, padding: spacing.md },
  pincodeEnquiryTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  pincodeEnquiryButton: { marginTop: spacing.md },
  paymentButtonWrap: { marginTop: 14, marginBottom: 18 },
});
