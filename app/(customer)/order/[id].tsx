import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AppCard, Button, ErrorState, LoadingState, Screen } from '../../../components/UI';
import { colors, spacing } from '../../../constants/theme';
import { getCustomerOrder, type CustomerOrder } from '../../../services/orders/orderService';
import { useAppStore } from '../../../store/appStore';
import { createCashfreePaymentSession, paymentStatusMessage, persistCashfreePaymentAttempt, prettyPaymentStatus, startCashfreePayment, type PaymentTransaction } from '../../../services/payments/paymentService';
import { clearPendingPaymentAttempt } from '../../../services/payments/paymentAttemptStore';

function money(value: unknown) {
  const n = Number(value ?? 0);
  return `₹${Number.isFinite(n) ? Math.round(n) : 0}`;
}
function prettyStatus(value?: string) {
  return String(value ?? 'pending').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}
function formatDate(value: unknown) {
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  const date = new Date(String(value ?? ''));
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatDeliveryDate(value: unknown) {
  if (!value) return '—';
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
  const date = new Date(`${String(value)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function itemPackaging(item: Record<string, unknown>) {
  const quantity = Math.max(1, Number(item.quantity ?? 1));
  const totalWeight = Number(item.weightGrams ?? 0);
  if (Number.isFinite(totalWeight) && totalWeight > 0) {
    const perPack = totalWeight / quantity;
    const label = perPack >= 1000 && perPack % 1000 === 0 ? `${perPack / 1000}kg` : `${perPack}g`;
    return `${label} pack × ${quantity}`;
  }
  return `Qty ${quantity}`;
}
function statusHistory(order: CustomerOrder) {
  const raw = (order as CustomerOrder & { statusHistory?: unknown }).statusHistory;
  return Array.isArray(raw) ? raw.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object')) : [];
}
function statusDate(entry: Record<string, unknown>) {
  return entry.createdAt ?? entry.updatedAt ?? entry.timestamp;
}

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const mobile = useAppStore((s) => s.mobile);
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      if (!mobile || !id) {
        if (active) {
          setLoading(false);
          setError('Order not available.');
        }
        return;
      }
      try {
        const result = await getCustomerOrder(mobile, String(id));
        if (!active) return;
        if (!result) setError('This order could not be found.');
        else setOrder(result);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Unable to load order.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [mobile, id]);

  const address = order?.deliveryAddressSnapshot ?? order?.deliveryAddress;
  const items = order?.items ?? [];
  const total = order?.totalAmount ?? order?.total ?? 0;
  const delivery = order?.deliveryCharge ?? order?.deliveryFee ?? 0;
  const discount = order?.discountTotal ?? order?.discount ?? 0;
  const transactions: PaymentTransaction[] = Array.isArray(order?.paymentTransactions) ? order.paymentTransactions : [];
  const history = useMemo(() => (order ? statusHistory(order) : []), [order]);
  const canRetryPayment = ['pending', 'failed'].includes(String(order?.paymentStatus ?? '').toLowerCase())
    || ['pending_payment', 'payment_failed'].includes(String(order?.status ?? '').toLowerCase());

  const retryPayment = async () => {
    if (!order || !mobile || retrying) return;
    setRetrying(true);
    try {
      const orderIds = [String(order.id)].filter(Boolean);
      const attemptId = String((order as CustomerOrder & { paymentAttemptId?: unknown }).paymentAttemptId || `retry-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
      const totalAmount = Number(order.totalAmount ?? order.total ?? 0);
      await persistCashfreePaymentAttempt({
        paymentAttemptId: attemptId,
        orderIds,
        primaryOrderId: String(order.id),
        primaryOrderNumber: String(order.orderNumber || order.id),
        total: totalAmount,
      });
      const session = await createCashfreePaymentSession(orderIds, mobile);
      await persistCashfreePaymentAttempt({
        paymentAttemptId: attemptId,
        cashfreeOrderId: session.cashfreeOrderId,
        orderIds,
        primaryOrderId: String(order.id),
        primaryOrderNumber: String(order.orderNumber || order.id),
        total: session.amount || totalAmount,
      });
      const result = await startCashfreePayment(session);
      if (result.status === 'paid') {
        await clearPendingPaymentAttempt();
        router.replace({ pathname: '/(customer)/checkout/success', params: { orderNumber: String(order.orderNumber || order.id), total: String(session.amount || totalAmount) } });
        return;
      }
      if (result.status === 'failed') {
        Alert.alert('Payment failed', result.message || 'Your payment was not completed. You can retry again from this order.');
        return;
      }
      router.replace('/(customer)/checkout/payment-status');
    } catch (e) {
      Alert.alert('Unable to retry payment', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setRetrying(false);
    }
  };

  if (loading) {
    return <Screen><LoadingState label="Loading order…" /></Screen>;
  }

  if (error || !order) {
    return (
      <Screen>
        <View style={styles.errorWrap}>
          <ErrorState title={error || 'Order not found.'} message="Only your own customer orders can be viewed here." />
          <Button title="Back to My Orders" onPress={() => router.replace('/(customer)/(tabs)/orders')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppCard style={styles.firstCard}>
        <View style={styles.rowBetween}>
          <View style={styles.flex}>
            <Text style={styles.orderNumber}>{order.orderNumber ? `#${order.orderNumber}` : `#${order.id}`}</Text>
            <Text style={styles.mutedSpaced}>{formatDate(order.createdAt)}</Text>
          </View>
          <Text style={styles.status}>{prettyStatus(order.status)}</Text>
        </View>
      </AppCard>

      <AppCard>
        <Text style={styles.cardTitle}>Order items</Text>
        {items.length === 0 ? (
          <Text style={styles.muted}>No item details are available for this order.</Text>
        ) : (
          items.map((item, index) => {
            const name = String(item.productName ?? 'Product');
            const qty = Math.max(1, Number(item.quantity ?? 1));
            const price = Number(item.lineTotal ?? (Number(item.unitPrice ?? 0) * qty));
            return (
              <View key={`${String(item.productId ?? item.salableProductId ?? index)}-${index}`} style={[styles.listRow, index < items.length - 1 && styles.listDivider]}>
                <View style={styles.rowBetween}>
                  <Text style={styles.itemName}>{name}</Text>
                  <Text style={styles.strong}>{money(price)}</Text>
                </View>
                <Text style={styles.mutedTop4}>
                  {itemPackaging(item)}
                  {item.sellingOptionLabel ? ` · ${String(item.sellingOptionLabel)}` : ''}
                </Text>
              </View>
            );
          })
        )}
      </AppCard>

      <AppCard>
        <Text style={styles.cardTitle}>Delivery</Text>
        <Text style={styles.muted}>Delivery date</Text>
        <Text style={styles.value}>{formatDeliveryDate(order.deliveryDate ?? order.scheduledDeliveryDate)}</Text>
        {order.deliveryStatus ? (
          <View style={styles.block}>
            <Text style={styles.muted}>Delivery status</Text>
            <Text style={styles.valueGreen}>{prettyStatus(order.deliveryStatus)}</Text>
          </View>
        ) : null}
        <View style={styles.section}>
          <Text style={styles.subTitle}>Delivery address</Text>
          <Text style={styles.addressName}>{String(address?.name ?? '')}</Text>
          <Text style={styles.mutedTop4}>{String(address?.addressLine1 ?? '')}</Text>
          {address?.addressLine2 ? <Text style={styles.muted}>{String(address.addressLine2)}</Text> : null}
          <Text style={styles.muted}>{[address?.city, address?.state, address?.pincode].filter(Boolean).join(', ')}</Text>
          <Text style={styles.mutedTop4}>{String(address?.mobileNumber ?? order.customerMobile ?? '')}</Text>
        </View>
      </AppCard>

      {String(order.deliveryStatus ?? order.status ?? '').toLowerCase() === 'delivered' ? (
        <AppCard>
          <Text style={styles.strong}>How was this delivery?</Text>
          <Text style={styles.mutedSpaced}>Rate your delivered order and share feedback.</Text>
          <View style={styles.block}><Button title="Rate this order" onPress={() => router.push({ pathname: '/(customer)/account/feedback', params: { orderId: order.id } })} /></View>
        </AppCard>
      ) : null}

      {history.length > 0 ? (
        <AppCard>
          <Text style={styles.cardTitle}>Order status history</Text>
          {history.map((entry, index) => (
            <View key={`${String(entry.id ?? entry.status ?? index)}-${index}`} style={[styles.historyRow, index < history.length - 1 && styles.listDivider]}>
              <View style={styles.rowBetween}>
                <Text style={styles.medium}>{prettyStatus(String(entry.status ?? 'updated'))}</Text>
                <Text style={styles.small}>{formatDate(statusDate(entry))}</Text>
              </View>
              {entry.message ? <Text style={styles.mutedTop3}>{String(entry.message)}</Text> : null}
            </View>
          ))}
        </AppCard>
      ) : null}

      <AppCard>
        <Text style={styles.cardTitle}>Payment & total</Text>
        <View style={styles.totalRow}>
          <Text style={styles.muted}>Product total</Text>
          <Text style={styles.plain}>{money(order.subtotal)}</Text>
        </View>
        {discount > 0 ? (
          <View style={styles.totalRow}>
            <Text style={styles.green}>You save</Text>
            <Text style={styles.green}>−{money(discount)}</Text>
          </View>
        ) : null}
        <View style={styles.totalRow}>
          <Text style={styles.muted}>Delivery charge</Text>
          <Text style={styles.plain}>{money(delivery)}</Text>
        </View>
        <View style={styles.grandTotalRow}>
          <Text style={styles.grandTotalLabel}>Total</Text>
          <Text style={styles.grandTotal}>{money(total)}</Text>
        </View>

        <Text style={styles.mutedTop10}>
          Payment: {prettyStatus(order.paymentMethod)} · {prettyPaymentStatus(order.paymentStatus)}
        </Text>
        <Text style={styles.mutedSpaced}>{paymentStatusMessage(order.paymentStatus)}</Text>
        {order.transactionId ? <Text style={styles.mutedSpaced}>Transaction: {order.transactionId}</Text> : null}
        {canRetryPayment ? (
          <View style={styles.block}>
            <Button title="Retry Payment" loading={retrying} onPress={retryPayment} />
          </View>
        ) : null}

        {transactions.length > 0 ? (
          <View style={styles.transactions}>
            <Text style={styles.subTitle}>Payment transactions</Text>
            {transactions.map((transaction, index) => (
              <View key={transaction.id ?? transaction.transactionId ?? `transaction-${index}`} style={[styles.transactionRow, index < transactions.length - 1 && styles.listDivider]}>
                <View style={styles.rowBetween}>
                  <Text style={styles.medium}>{transaction.method || order.paymentMethod || 'Payment'}</Text>
                  {transaction.amount != null ? <Text style={styles.strong}>{money(transaction.amount)}</Text> : null}
                </View>
                <Text style={styles.mutedTop3}>{prettyPaymentStatus(transaction.status)}</Text>
                {transaction.transactionId ? <Text style={styles.mutedTop3}>Transaction: {transaction.transactionId}</Text> : null}
                {transaction.createdAt ? <Text style={styles.mutedTop3}>{formatDate(transaction.createdAt)}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}
      </AppCard>

      <View style={styles.backAction}>
        <Button title="Back to My Orders" onPress={() => router.replace('/(customer)/(tabs)/orders')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  errorWrap: { paddingTop: spacing.xl, gap: spacing.md },
  firstCard: { marginTop: spacing.sm },
  flex: { flex: 1 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  orderNumber: { fontSize: 18, fontWeight: '900', color: colors.ink },
  status: { fontWeight: '900', color: colors.greenDark },
  cardTitle: { fontWeight: '900', color: colors.ink, marginBottom: 10 },
  subTitle: { fontWeight: '900', color: colors.ink, marginBottom: 7 },
  itemName: { flex: 1, fontWeight: '800', color: colors.ink },
  strong: { fontWeight: '900', color: colors.ink },
  medium: { fontWeight: '800', color: colors.ink },
  plain: { color: colors.ink },
  green: { color: colors.greenDark },
  small: { color: colors.inkSoft, fontSize: 12 },
  muted: { color: colors.inkSoft },
  mutedTop3: { color: colors.inkSoft, marginTop: 3 },
  mutedTop4: { color: colors.inkSoft, marginTop: 4 },
  mutedSpaced: { color: colors.inkSoft, marginTop: 5 },
  mutedTop10: { color: colors.inkSoft, marginTop: 10 },
  value: { fontWeight: '900', color: colors.ink, marginTop: 3 },
  valueGreen: { fontWeight: '900', color: colors.greenDark, marginTop: 3 },
  block: { marginTop: spacing.md },
  section: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.lineSoft, paddingTop: spacing.md },
  addressName: { fontWeight: '800', color: colors.ink },
  listRow: { paddingVertical: 10 },
  historyRow: { paddingVertical: 9 },
  transactionRow: { paddingVertical: spacing.sm },
  listDivider: { borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  grandTotalRow: { borderTopWidth: 1, borderTopColor: colors.lineSoft, paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between' },
  grandTotalLabel: { fontSize: 16, fontWeight: '900', color: colors.ink },
  grandTotal: { fontSize: 17, fontWeight: '900', color: colors.ink },
  transactions: { marginTop: 14, borderTopWidth: 1, borderTopColor: colors.lineSoft, paddingTop: spacing.md },
  backAction: { marginTop: spacing.xs, marginBottom: 18 },
});
