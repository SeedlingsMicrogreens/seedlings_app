import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { AppCard, Button, PageTitle, Screen, TextAction } from '../../../components/UI';
import { colors, radius, spacing } from '../../../constants/theme';
import { useAppStore } from '../../../store/appStore';
import { getUnifiedCartTotals, type CartItem, type SubscriptionCartItem } from '../../../services/cart/cartService';
import { getCustomerAddresses, type CustomerAddress } from '../../../services/customerAddresses';
import { nextWeekSaturday, resolveCartDeliveryDates, shouldSubmitAvailabilityEnquiry } from '../../../services/orders/customerOrderAvailability';
import { calculateUniqueDateCheckoutDeliveryCharges, buildSubscriptionDeliveryDates, type UniqueDateCheckoutDeliveryCharges } from '../../../services/orders/deliveryChargeService';
import { getCachedProducts, getProducts } from '../../../services/products/productService';
import { createCustomerMixedCheckout } from '../../../services/orders/mixedCheckoutService';
import { submitHighDemandEnquiries } from '../../../services/orders/customerEnquiryService';
import { submitAvailabilityContactRequest } from '../../../services/orders/customerContactRequestService';
import { createCashfreePaymentSession, persistCashfreePaymentAttempt, startCashfreePayment } from '../../../services/payments/paymentService';
import { clearPendingPaymentAttempt, getPendingPaymentAttempt } from '../../../services/payments/paymentAttemptStore';
import { calculateCustomerOffers, type CheckoutOfferResult } from '../../../services/orders/customerOffers';
import { parseWeightGrams } from '../../../services/orders/weightUtils';

const CHECKOUT_VALIDATION_TIMEOUT_MS = 30_000;

function formatAddress(address: CustomerAddress) {
  return [address.addressLine1, address.addressLine2, address.landmark, address.city, address.state, address.pincode].filter(Boolean).join(', ');
}

function money(value: number) {
  return `₹${Math.round(Number(value) || 0)}`;
}

function formatDeliveryDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function weightLabel(item: CartItem) {
  return item.selectedWeight || 'Pack';
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
  const [validating, setValidating] = useState(false);
  const [deliveryCharges, setDeliveryCharges] = useState<UniqueDateCheckoutDeliveryCharges | null>(null);
  const [chargeLoading, setChargeLoading] = useState(true);
  const [checkoutLines, setCheckoutLines] = useState<CheckoutLine[]>([]);
  const [offerResult, setOfferResult] = useState<CheckoutOfferResult>({ priceSavings: 0, oneTimePriceSavings: 0, subscriptionPriceSavings: 0, deliverySavings: 0, totalSavings: 0 });
  const paymentAttemptId = useRef(`pay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  const paymentInFlight = useRef(false);

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
          buildSubscriptionDeliveryDates(item.deliveryDate || item.startDate || nextWeekSaturday(), Number(item.deliveriesPerTerm) || 1),
        ),
      });
      const oneTimeSubtotal = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
      const subscriptionSubtotal = subscriptionCart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
      const offers = await calculateCustomerOffers({ pincode, oneTimeSubtotal, subscriptionSubtotal, oneTimeDelivery: result.total });
      setCheckoutLines(lines);
      setDeliveryCharges(result);
      setOfferResult(offers);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Unable to calculate delivery charges.');
    } finally {
      setChargeLoading(false);
    }
  }, [addresses, selectedAddressId, cart, subscriptionCart, buildCheckoutLines]);

  useEffect(() => { void loadDeliveryCharge(); }, [loadDeliveryCharge]);

  const selectedAddress = addresses.find((item) => item.id === selectedAddressId);
  const finalDeliveryCharge = Math.max(0, Number(deliveryCharges?.total ?? 0) - (subscriptionCart.length > 0 ? 0 : offerResult.deliverySavings));
  const checkoutTotal = Math.max(0, totals.subtotal - offerResult.priceSavings) + finalDeliveryCharge;

  const validateCheckout = async () => {
    if (paymentInFlight.current || validating) return;
    paymentInFlight.current = true;
    setValidationError('');
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
      const pendingAttempt = await getPendingPaymentAttempt();
      if (pendingAttempt?.orderIds.length) {
        paymentAttemptId.current = pendingAttempt.paymentAttemptId;
        const session = await createCashfreePaymentSession(pendingAttempt.orderIds, mobile);
        await persistCashfreePaymentAttempt({
          ...pendingAttempt,
          cashfreeOrderId: session.cashfreeOrderId,
          total: session.amount || pendingAttempt.total,
        });
        const paymentResult = await startCashfreePayment(session);
        if (paymentResult.status === 'paid') {
          useAppStore.getState().clearCart();
          await clearPendingPaymentAttempt();
          router.replace({ pathname: '/(customer)/checkout/success', params: { orderNumber: pendingAttempt.primaryOrderNumber, total: String(session.amount || pendingAttempt.total) } });
          return;
        }
        if (paymentResult.status === 'failed') {
          Alert.alert('Payment failed', paymentResult.message || 'Your payment was not completed. You can retry from this checkout or the order detail page.');
          return;
        }
        router.replace('/(customer)/checkout/payment-status');
        return;
      }

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
          for (const changed of changedDates) {
            const cartItem = [...cart, ...subscriptionCart].find((candidate) => changed.key.includes(candidate.id));
            await submitAvailabilityContactRequest({
              mobile,
              productId: changed.productId,
              productName: changed.name,
              requestedGrams: (Number(cartItem?.selectedWeight?.replace(/[^0-9.]/g, '')) || 0) * Number(cartItem?.quantity || 1),
              requestedDeliveryDate: changed.requestedDate,
              resolvedDeliveryDate: changed.deliveryDate || undefined,
              address: selectedAddress as unknown as Record<string, unknown>,
            });
          }
          Alert.alert('Enquiry submitted', 'Your enquiry has been submitted. No order or payment was created.');
          return;
        }

        const resolvedDates: Record<string, string | null> = {};
        for (const item of resolution.items) resolvedDates[item.key] = item.deliveryDate;
        useAppStore.getState().applyCartDeliveryDates(resolvedDates);
        await loadDeliveryCharge();
        return;
      }

      // Persist the attempt ID before order creation. If the app closes between
      // pending-order creation and Cashfree session creation, the same attempt ID
      // is reused on the next checkout and prevents duplicate business orders.
      await persistCashfreePaymentAttempt({
        paymentAttemptId: paymentAttemptId.current,
        orderIds: [],
        primaryOrderId: '',
        primaryOrderNumber: '',
        total: checkoutTotal,
      });

      const paymentAttempt = await createCustomerMixedCheckout({
        mobile,
        addressId: selectedAddress.id,
        deliverySlot: checkoutLines.find((line) => line.dates[0])?.dates[0] || nextWeekSaturday(),
        paymentAttemptId: paymentAttemptId.current,
        paymentMethod: 'online',
        oneTimeItems: useAppStore.getState().cart,
        subscriptionItems: useAppStore.getState().subscriptionCart,
      });

      const orderIds = [
        ...(paymentAttempt.paymentOrderIds.length ? paymentAttempt.paymentOrderIds : [paymentAttempt.oneTimeOrderId, ...paymentAttempt.subscriptionOrderIds]),
      ].filter(Boolean);
      if (!orderIds.length) throw new Error('No pending order was created for payment.');

      // Persist the business attempt before opening Cashfree. If the app closes,
      // the attempt can be reconciled later without creating another order set.
      await persistCashfreePaymentAttempt({
        paymentAttemptId: paymentAttempt.paymentAttemptId,
        orderIds,
        primaryOrderId: paymentAttempt.primaryOrderId,
        primaryOrderNumber: paymentAttempt.primaryOrderNumber,
        total: paymentAttempt.total,
      });

      const session = await createCashfreePaymentSession(orderIds, mobile);
      if (Math.round(session.amount) !== Math.round(paymentAttempt.total)) {
        throw new Error(`Payment amount mismatch. Checkout total is ${money(paymentAttempt.total)} but Cashfree received ${money(session.amount)}.`);
      }

      await persistCashfreePaymentAttempt({
        paymentAttemptId: paymentAttempt.paymentAttemptId,
        cashfreeOrderId: session.cashfreeOrderId,
        orderIds,
        primaryOrderId: paymentAttempt.primaryOrderId,
        primaryOrderNumber: paymentAttempt.primaryOrderNumber,
        total: paymentAttempt.total,
      });

      const paymentResult = await startCashfreePayment(session);
      if (paymentResult.status === 'paid') {
        useAppStore.getState().clearCart();
        await clearPendingPaymentAttempt();
        router.replace({ pathname: '/(customer)/checkout/success', params: { orderNumber: paymentAttempt.primaryOrderNumber, total: String(paymentAttempt.total) } });
        return;
      }

      if (paymentResult.status === 'failed') {
        Alert.alert('Payment failed', paymentResult.message || 'Your payment was not completed. You can retry from this checkout or the order detail page.');
        return;
      }

      router.replace('/(customer)/checkout/payment-status');
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Unable to validate checkout. Please try again.');
    } finally {
      setValidating(false);
      paymentInFlight.current = false;
    }
  };

  const oneTimeLines = checkoutLines.filter((line) => line.kind === 'one-time');
  const subscriptionLines = checkoutLines.filter((line) => line.kind === 'subscription');

  const renderPurchase = (line: CheckoutLine) => {
    const item = line.item;
    const itemMrp = (item.mrp && item.mrp > 0 ? item.mrp : item.price) * item.quantity;
    const itemPrice = item.price * item.quantity;
    const itemSaving = Math.max(0, itemMrp - itemPrice);
    const firstDate = line.dates[0] || nextWeekSaturday();

    return (
      <AppCard key={line.key} style={styles.purchaseCard}>
        <View style={styles.purchaseTop}>
          <View style={styles.purchaseInfo}>
            <Text style={styles.purchaseName}>{item.name}</Text>
            <Text style={styles.purchaseMeta}>
              {weightLabel(item)} × {item.quantity} · {line.kind === 'subscription' ? (item as SubscriptionCartItem).planName : 'One-time'}
            </Text>
          </View>
          <View style={styles.purchasePrice}>
            {itemSaving > 0 ? <Text style={styles.purchaseMrp}>{money(itemMrp)}</Text> : null}
            <Text style={styles.purchaseSale}>{money(itemPrice)}</Text>
          </View>
        </View>
        <Text style={styles.deliveryText}>Delivery: {formatDeliveryDate(firstDate)}</Text>
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

      {oneTimeLines.length > 0 ? (
        <View>
          <Text style={styles.sectionTitle}>One-time purchases</Text>
          {oneTimeLines.map(renderPurchase)}
        </View>
      ) : null}

      {subscriptionLines.length > 0 ? (
        <View>
          <Text style={styles.sectionTitle}>Subscription purchases</Text>
          {subscriptionLines.map(renderPurchase)}
        </View>
      ) : null}

      <View style={styles.summarySection}>
        <Text style={styles.sectionTitle}>Order summary</Text>
        <AppCard style={styles.summaryCard}>
          <View style={styles.summaryLine}>
            <Text style={styles.summaryLabel}>Product subtotal</Text>
            <Text style={styles.summaryValue}>{money(totals.subtotal)}</Text>
          </View>
          {offerResult.priceSavings > 0 ? (
            <View style={styles.summaryLine}>
              <Text style={styles.saving}>Offer savings</Text>
              <Text style={styles.saving}>−{money(offerResult.priceSavings)}</Text>
            </View>
          ) : null}
          <View style={styles.summaryLine}>
            <Text style={styles.summaryLabel}>Delivery charge</Text>
            <Text style={styles.summaryValue}>{chargeLoading ? 'Calculating…' : money(finalDeliveryCharge)}</Text>
          </View>
          {offerResult.deliverySavings > 0 && subscriptionCart.length === 0 ? (
            <View style={styles.summaryLine}>
              <Text style={styles.saving}>Delivery offer</Text>
              <Text style={styles.saving}>−{money(offerResult.deliverySavings)}</Text>
            </View>
          ) : null}
          {deliveryCharges && deliveryCharges.dates.length > 0 ? (
            <Text style={styles.chargeNote}>Charged once for each unique delivery date ({deliveryCharges.dates.length}).</Text>
          ) : null}
          <View style={styles.totalLine}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.total}>{money(checkoutTotal)}</Text>
          </View>
        </AppCard>
      </View>

      {addressError ? <Text style={styles.error}>{addressError}</Text> : null}
      {validationError ? <Text style={styles.error}>{validationError}</Text> : null}
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
  purchasePrice: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  purchaseMrp: { color: colors.inkFaint, fontSize: 11, textDecorationLine: 'line-through' },
  purchaseSale: { color: colors.greenDark, fontSize: 14, fontWeight: '900' },
  deliveryText: { color: colors.inkSoft, fontSize: 11, marginTop: spacing.sm },
  summarySection: { marginTop: 2 },
  summaryCard: { paddingHorizontal: 14, paddingTop: 7, paddingBottom: spacing.md },
  summaryLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  summaryLabel: { color: colors.inkSoft, fontSize: 12 },
  summaryValue: { color: colors.inkSoft, fontSize: 12 },
  saving: { color: colors.greenDark, fontSize: 12, fontWeight: '900' },
  chargeNote: { color: colors.inkSoft, fontSize: 10, lineHeight: 15, marginTop: 7, marginBottom: 2 },
  totalLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 13 },
  totalLabel: { color: colors.ink, fontSize: 15, fontWeight: '900' },
  total: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  muted: { color: colors.inkSoft, marginTop: 4, lineHeight: 18, fontSize: 12 },
  error: { color: colors.danger, fontSize: 13, fontWeight: '700', marginVertical: 6 },
  progressCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.panel, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineSoft, padding: 10, marginBottom: 10 },
  progressText: { color: colors.inkSoft, fontSize: 13, fontWeight: '700' },
  paymentButtonWrap: { marginTop: 14, marginBottom: 18 },
});

