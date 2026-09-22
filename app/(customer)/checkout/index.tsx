import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Button, Screen } from '../../../components/UI';
import { colors } from '../../../constants/theme';
import { useAppStore } from '../../../store/appStore';
import { getUnifiedCartTotals } from '../../../services/cart/cartService';
import { getCustomerAddresses, type CustomerAddress } from '../../../services/customerAddresses';
import { createCustomerMixedCheckout } from '../../../services/orders/mixedCheckoutService';
import { checkProductAvailability, nextWeekSaturday } from '../../../services/orders/customerOrderAvailability';
import { confirmHarvestShortage } from '../../../services/orders/customerAlerts';
import { calculateCheckoutDeliveryCharges, type CheckoutDeliveryCharges } from '../../../services/orders/deliveryChargeService';
import { createCashfreePaymentSession, isPaymentGatewayConfigured, startCashfreePayment } from '../../../services/payments/paymentService';
import { getCachedProducts, getProducts } from '../../../services/products/productService';

function formatAddress(address: CustomerAddress) {
  return [address.addressLine1, address.addressLine2, address.landmark, address.city, address.state, address.pincode].filter(Boolean).join(', ');
}

const DELIVERY_SLOTS = ['Saturday morning', 'Saturday evening'] as const;
const CHECKOUT_VALIDATION_TIMEOUT_MS = 30_000;

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
type DeliverySlot = (typeof DELIVERY_SLOTS)[number];

export default function Checkout() {
  const cart = useAppStore((s) => s.cart);
  const subscriptionCart = useAppStore((s) => s.subscriptionCart);
  const mobile = useAppStore((s) => s.mobile);
  const totals = useMemo(() => getUnifiedCartTotals({ oneTimeItems: cart, subscriptionItems: subscriptionCart }), [cart, subscriptionCart]);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<DeliverySlot | ''>('');
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const [addressError, setAddressError] = useState('');
  const [validationError, setValidationError] = useState('');
  const [placingOrder, setPlacingOrder] = useState(false);
  const [paymentStage, setPaymentStage] = useState('');
  const [deliveryCharges, setDeliveryCharges] = useState<CheckoutDeliveryCharges | null>(null);
  const [chargeLoading, setChargeLoading] = useState(true);

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

  const loadDeliveryCharge = useCallback(async () => {
    const selected = addresses.find((item) => item.id === selectedAddressId);
    const pincode = String(selected?.pincode ?? '').replace(/\D/g, '');
    setChargeLoading(true);
    setDeliveryCharges(null);
    if (!/^\d{6}$/.test(pincode)) { setChargeLoading(false); return; }
    try {
      const result = await calculateCheckoutDeliveryCharges({
        pincode,
        oneTime: cart.length > 0,
        subscriptions: subscriptionCart.map((item) => ({ planId: item.planId, planName: item.planName })),
      });
      setDeliveryCharges(result);
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Unable to calculate delivery charges.');
    } finally { setChargeLoading(false); }
  }, [addresses, selectedAddressId, cart.length, subscriptionCart]);

  useFocusEffect(useCallback(() => { void loadAddresses(); }, [loadAddresses]));
  useEffect(() => { void loadDeliveryCharge(); }, [loadDeliveryCharge]);

  const selectedAddress = addresses.find((item) => item.id === selectedAddressId);
  const checkoutTotal = totals.subtotal + (deliveryCharges?.total ?? 0);
  const oneTimeSubtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const subscriptionSubtotal = subscriptionCart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const validateCheckout = async () => {
    setValidationError('');
    if (cart.length === 0 && subscriptionCart.length === 0) return setValidationError('Your cart is empty.');
    if (!selectedAddress) return setValidationError('Please select a delivery address.');
    if (!mobile) return setValidationError('Customer session not found. Please log in again.');
    if (!selectedSlot) return setValidationError('Please select a weekend delivery slot.');
    if (chargeLoading) return setValidationError('Delivery charge is still loading. Please try again.');
    if (!deliveryCharges) return setValidationError('Delivery charge could not be calculated. Please try again later.');

    setPlacingOrder(true);
    setPaymentStage('Preparing your order…');
    console.log('[Cashfree][Checkout] Place Order started');
    try {
      setPaymentStage('Checking product availability…');
      console.log('[Cashfree][Checkout] refreshing products');
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
        console.warn('[Cashfree][Checkout] live product refresh timed out; using cached products for pre-check. Server will revalidate before creating the order.');
        products = cachedProducts;
      }
      console.log('[Cashfree][Checkout] products refreshed');
      const productMap = new Map(products.map((product) => [product.id, product]));
      const shortageCandidates: Array<{ result: Awaited<ReturnType<typeof checkProductAvailability>> }> = [];
      const oneTimeDeliveryDate = nextWeekSaturday();
      for (const item of cart) {
        const product = productMap.get(item.id);
        if (!product || !product.active || !product.oneTimePurchase) throw new Error(`Product "${item.name}" is no longer available for one-time purchase.`);
        shortageCandidates.push({ result: await withTimeout(
          checkProductAvailability({ product, quantity: item.quantity, deliveryDate: oneTimeDeliveryDate }),
          CHECKOUT_VALIDATION_TIMEOUT_MS,
          'Product availability check is taking too long. Please check your internet connection and try again.',
        ) });
      }
      for (const item of subscriptionCart) {
        const product = productMap.get(item.id);
        if (!product || !product.active) throw new Error(`Product "${item.name}" is no longer available.`);
        shortageCandidates.push({ result: await withTimeout(
          checkProductAvailability({ product, quantity: item.quantity, deliveryDate: item.startDate || oneTimeDeliveryDate }),
          CHECKOUT_VALIDATION_TIMEOUT_MS,
          'Product availability check is taking too long. Please check your internet connection and try again.',
        ) });
      }

      const shortages = shortageCandidates.filter(({ result }) => result.hasShortage);
      let shortageDecision: 'continue' | 'contact' | undefined;
      if (shortages.length) {
        const availableGrams = Math.min(...shortages.map(({ result }) => result.availableGrams));
        const requestedGrams = shortages.reduce((sum, { result }) => sum + result.requestedGrams, 0);
        const shortageGrams = shortages.reduce((sum, { result }) => sum + result.shortageGrams, 0);
        shortageDecision = await confirmHarvestShortage({ mode: 'one-time', availableGrams, requestedGrams, shortageGrams });
      }

      setPaymentStage('Creating your pending order…');
      console.log('[Cashfree][Checkout] creating pending order(s)');
      const result = await createCustomerMixedCheckout({
        mobile,
        addressId: selectedAddress.id,
        deliverySlot: selectedSlot,
        paymentMethod: 'online',
        oneTimeItems: cart,
        subscriptionItems: subscriptionCart,
        shortageDecision,
      });

      const orderIds = [
        result.oneTimeOrderId,
        ...result.subscriptionOrderIds,
      ].filter(Boolean);

      console.log(`[Cashfree][Checkout] pending order(s) created: ${orderIds.length}`);
      if (!orderIds.length) throw new Error('Unable to create a pending order for payment. Please try again.');
      setPaymentStage('Connecting to secure payment…');
      const paymentSession = await createCashfreePaymentSession(orderIds, mobile);
      setPaymentStage('Opening Cashfree…');
      console.log('[Cashfree][Checkout] starting Cashfree checkout');
      const paymentResult = await startCashfreePayment(paymentSession);
      setPaymentStage('Verifying payment…');
      console.log(`[Cashfree][Checkout] payment result: ${paymentResult.status}`);

      if (paymentResult.status !== 'paid') {
        throw new Error(
          paymentResult.status === 'pending'
            ? 'Payment is still pending. Your order has not been marked as paid. Please verify the payment status before trying again.'
            : paymentResult.message || 'Payment failed. Your order has not been marked as paid.',
        );
      }

      console.log('[Cashfree][Checkout] server verified payment as paid; clearing cart');
      useAppStore.getState().clearCart();
      router.replace({
        pathname: '/(customer)/checkout/success',
        params: {
          orderId: result.primaryOrderId,
          orderNumber: result.primaryOrderNumber,
          total: String(result.total),
          paymentMethod: 'online',
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'HARVEST_SHORTAGE_CONFIRMATION_REQUIRED') {
        setValidationError('Limited harvest is available. Please try placing the order again to review the availability decision.');
      } else {
        setValidationError(error instanceof Error ? error.message : 'Unable to place your order. Please try again.');
      }
    } finally {
      setPlacingOrder(false);
      setPaymentStage('');
    }
  };

  return (
    <Screen>


      <Text style={styles.heading}>Delivery details</Text>
      <Text style={styles.subheading}>Confirm your delivery</Text>
      {loadingAddresses ? (
        <View style={styles.stateCard}><ActivityIndicator color={colors.greenDark} /><Text style={styles.muted}>Loading your addresses…</Text></View>
      ) : addresses.length === 0 ? (
        <View style={styles.card}><Text style={styles.bold}>No saved address</Text><Text style={styles.muted}>Add a delivery address before continuing.</Text><View style={{ marginTop: 12 }}><Button title="Add Address" onPress={() => router.push('/(customer)/account/addresses')} /></View></View>
      ) : (
        <>
          {addresses.map((address) => {
            const selected = address.id === selectedAddressId;
            return <Pressable key={address.id} onPress={() => { setSelectedAddressId(address.id); setValidationError(''); }} style={[styles.card, selected && styles.selectedCard]}>
              <View style={styles.addressHeader}><Text style={styles.bold}>{address.label || 'Address'}</Text><Text style={selected ? styles.selectedMark : styles.radio}>{selected ? '●' : '○'}</Text></View>
              {address.name ? <Text style={styles.bold}>{address.name}</Text> : null}
              <Text style={styles.muted}>{formatAddress(address)}</Text>
              {address.mobileNumber ? <Text style={styles.muted}>+91 {address.mobileNumber}</Text> : null}
            </Pressable>;
          })}
          <Button title="Manage Addresses" secondary onPress={() => router.push('/(customer)/account/addresses')} />
        </>
      )}

      <Text style={styles.heading}>Delivery slot</Text>
      <Text style={styles.muted}>Choose your preferred Saturday delivery slot for {nextWeekSaturday()}.</Text>
      {DELIVERY_SLOTS.map((slot) => {
        const selected = selectedSlot === slot;
        return <Pressable key={slot} onPress={() => { setSelectedSlot(slot); setValidationError(''); }} style={[styles.card, selected && styles.selectedCard]}>
          <View style={styles.addressHeader}><Text style={styles.bold}>{slot}</Text><Text style={selected ? styles.selectedMark : styles.radio}>{selected ? '●' : '○'}</Text></View>
          <Text style={styles.muted}>{nextWeekSaturday()}</Text>
        </Pressable>;
      })}

      <Text style={styles.heading}>Payment</Text>
      <View style={styles.card}>
        <Text style={styles.paymentText}>Online payment</Text>
        {!isPaymentGatewayConfigured() ? <Text style={styles.paymentNotice}>You will be securely redirected to Cashfree to complete your payment. Your order is marked pending until Cashfree confirms payment.</Text> : null}
      </View>

      <Text style={styles.heading}>Order summary</Text>
      <View style={styles.card}>
        <View style={styles.line}><Text style={styles.muted}>MRP</Text><Text style={styles.muted}>₹{totals.mrpSubtotal}</Text></View>
        <View style={styles.line}><Text style={styles.muted}>One-time purchases</Text><Text style={styles.muted}>₹{oneTimeSubtotal}</Text></View>
        {subscriptionSubtotal > 0 ? <View style={styles.line}><Text style={styles.muted}>Subscriptions</Text><Text style={styles.muted}>₹{subscriptionSubtotal}</Text></View> : null}
        {totals.savings > 0 ? <View style={styles.line}><Text style={styles.saving}>You save</Text><Text style={styles.saving}>−₹{totals.savings}</Text></View> : null}
        <View style={styles.line}><Text style={styles.muted}>One-time delivery</Text><Text style={styles.muted}>{chargeLoading ? 'Calculating…' : deliveryCharges?.oneTime.isFree ? '₹0 — FREE' : `₹${deliveryCharges?.oneTime.finalCharge ?? 0}`}</Text></View>
        {deliveryCharges?.subscriptions.map((charge) => <View key={charge.planId} style={styles.line}><Text style={styles.muted}>{charge.planName} delivery</Text><Text style={styles.muted}>{charge.isFree ? '₹0 — FREE' : `₹${charge.finalCharge}`}</Text></View>)}
        {(deliveryCharges?.oneTime.savings ?? 0) > 0 ? <View style={styles.line}><Text style={styles.saving}>You saved on one-time delivery</Text><Text style={styles.saving}>−₹{deliveryCharges?.oneTime.savings ?? 0}</Text></View> : null}
        <View style={[styles.line, { borderBottomWidth: 0 }]}><Text style={styles.totalLabel}>Grand total</Text><Text style={styles.total}>₹{checkoutTotal}</Text></View>
        {(deliveryCharges?.savingsTotal ?? 0) > 0 ? <Text style={styles.saving}>You saved ₹{deliveryCharges?.savingsTotal ?? 0} on delivery</Text> : null}
        <Text style={styles.muted}>Delivery uses the active pincode-specific Geolocation Master charge when available; otherwise the matching Delivery Charges Master fallback is used.</Text>
      </View>

      {deliveryCharges?.oneTime.sourceName ? <Text style={styles.muted}>One-time delivery source: {deliveryCharges.oneTime.sourceName}</Text> : null}
      {deliveryCharges?.subscriptions.map((charge) => charge.sourceName ? <Text key={`source-${charge.planId}`} style={styles.muted}>{charge.planName} delivery source: {charge.sourceName}</Text> : null)}
      {addressError ? <Text style={styles.error}>{addressError}</Text> : null}
      {validationError ? <Text style={styles.error}>{validationError}</Text> : null}
      {placingOrder && paymentStage ? <View style={styles.progressCard}><ActivityIndicator color={colors.greenDark} /><Text style={styles.progressText}>{paymentStage}</Text></View> : null}
      <View style={{ marginBottom: 18 }}><Button title={placingOrder ? 'Placing Order…' : 'Place Order'} onPress={placingOrder ? () => {} : validateCheckout} /></View>
    </Screen>
  );
}

const styles = {
  heading: { fontSize: 18, fontWeight: '900' as const, color: colors.ink, marginTop: 16, marginBottom: 4 },
  subheading: { fontSize: 16, fontWeight: '800' as const, color: colors.ink, marginBottom: 8 },
  card: { backgroundColor: colors.panel, borderRadius: 14, borderWidth: 1, borderColor: colors.lineSoft, padding: 15, marginBottom: 8 },
  selectedCard: { borderColor: colors.green, borderWidth: 2 },
  stateCard: { backgroundColor: colors.panel, borderRadius: 14, borderWidth: 1, borderColor: colors.lineSoft, padding: 18, marginBottom: 8, alignItems: 'center' as const, gap: 8 },
  addressHeader: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, marginBottom: 5 },
  bold: { fontWeight: '900' as const, color: colors.ink },
  muted: { color: colors.inkSoft, marginTop: 4, lineHeight: 19 },
  radio: { color: colors.inkFaint, fontSize: 18 },
  selectedMark: { color: colors.greenDark, fontSize: 18 },
  paymentText: { color: colors.ink, fontWeight: '800' as const },
  paymentNotice: { color: colors.inkSoft, backgroundColor: colors.paper, borderRadius: 10, padding: 10, marginTop: 8, lineHeight: 18 },
  line: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  saving: { color: colors.greenDark, fontWeight: '800' as const },
  totalLabel: { fontWeight: '900' as const, color: colors.ink },
  total: { fontWeight: '900' as const, fontSize: 19, color: colors.ink },
  error: { color: colors.danger, fontSize: 13, fontWeight: '700' as const, marginVertical: 6 },
  progressCard: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, backgroundColor: colors.panel, borderRadius: 10, borderWidth: 1, borderColor: colors.lineSoft, padding: 10, marginBottom: 10 },
  progressText: { color: colors.inkSoft, fontSize: 13, fontWeight: '700' as const },
};
