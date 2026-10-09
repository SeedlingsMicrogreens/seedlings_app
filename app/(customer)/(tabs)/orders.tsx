import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { AppCard, AppText, Chip, ErrorState, LoadingState, PageTitle, Screen, TextAction } from '../../../components/UI';
import { colors, spacing } from '../../../constants/theme';
import { getCustomerOrders, type CustomerOrder } from '../../../services/orders/orderService';
import { useAppStore } from '../../../store/appStore';

function money(value: unknown) {
  const n = Number(value ?? 0);
  return `₹${Number.isFinite(n) ? Math.round(n) : 0}`;
}
function prettyStatus(value?: string) {
  return String(value ?? 'pending').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}
function dateObject(value: unknown) {
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  const d = new Date(String(value ?? ''));
  return Number.isNaN(d.getTime()) ? null : d;
}
function dateText(value: unknown) {
  const d = dateObject(value);
  return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}
function orderType(order: CustomerOrder) {
  return String(order.orderType ?? '').toLowerCase() === 'subscription' ? 'subscription' : 'one_time';
}
function paymentLabel(order: CustomerOrder) {
  const status = String(order.paymentStatus ?? '').toLowerCase();
  if (status === 'paid' || status === 'success' || status === 'successful') return 'Paid';
  if (status === 'failed') return 'Payment failed';
  if (status === 'pending' || status === 'pending_payment') return 'Payment pending';
  return prettyStatus(order.paymentStatus);
}

export default function Orders() {
  const mobile = useAppStore((s) => s.mobile);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [filter, setFilter] = useState<'all' | 'one_time' | 'subscription' | 'past'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!mobile) {
      setOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setOrders(await getCustomerOrders(mobile));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load your orders.');
    } finally {
      setLoading(false);
    }
  }, [mobile]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const filtered = orders.filter((order) => {
    if (filter === 'one_time') return orderType(order) === 'one_time';
    if (filter === 'subscription') return orderType(order) === 'subscription';
    if (filter === 'past') {
      const date = dateObject(order.deliveryDate ?? order.scheduledDeliveryDate);
      return Boolean(date && date.getTime() < Date.now());
    }
    return true;
  });

  return (
    <Screen>
      <PageTitle title="My Orders" subtitle="View your purchases, delivery dates and payment status." />

      <View style={styles.filters}>
        {FILTERS.map(([value, label]) => <Chip key={value} label={label} selected={filter === value} onPress={() => setFilter(value)} />)}
      </View>

      {loading ? (
        <LoadingState label="Loading your orders…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : filtered.length === 0 ? (
        <AppCard>
          <AppText variant="h3">{orders.length ? 'No matching orders' : 'No orders yet'}</AppText>
          <AppText variant="bodySmall" style={styles.emptyMessage}>
            {orders.length ? 'Try another order filter.' : 'Your one-time purchases and subscription orders will appear here.'}
          </AppText>
          {!orders.length ? <TextAction label="Shop Fresh" icon="arrow-right" onPress={() => router.push('/(customer)/(tabs)/products')} style={styles.emptyAction} /> : null}
        </AppCard>
      ) : (
        filtered.map((order) => {
          const items = Array.isArray(order.items) ? order.items : [];
          const summary =
            items.length === 1
              ? String(items[0]?.productName ?? 'Product')
              : items.length > 1
                ? `${String(items[0]?.productName ?? 'Product')} + ${items.length - 1} more`
                : 'Order';
          const orderLabel = order.orderNumber ? `#${order.orderNumber}` : `#${order.id}`;

          return (
            <Pressable key={order.id} accessibilityRole="button" accessibilityLabel={`Order ${orderLabel}, ${prettyStatus(order.status)}`} onPress={() => router.push(`/(customer)/order/${order.id}`)}>
              <AppCard style={styles.orderCard}>
                <View style={styles.orderTop}>
                  <Text style={styles.orderNumber}>{orderLabel}</Text>
                  <Text style={styles.orderStatus}>{prettyStatus(order.status)}</Text>
                </View>

                <Text style={styles.summary}>{summary}</Text>
                <Text style={styles.meta}>
                  {items.length} {items.length === 1 ? 'item' : 'items'} · {orderType(order) === 'subscription' ? 'Subscription' : 'One Time'}
                </Text>
                <Text style={styles.metaTight}>
                  Amount {money(order.total)} · Ordered {dateText(order.createdAt)}
                </Text>
                <Text style={styles.metaTight}>
                  Delivery {dateText(order.deliveryDate ?? order.scheduledDeliveryDate)}
                  {order.deliveryStatus ? ` · ${prettyStatus(order.deliveryStatus)}` : ''}
                </Text>
                <Text style={styles.metaTight}>{paymentLabel(order)}</Text>

                <View style={styles.detailsRow}>
                  <Text style={styles.detailsLink}>View details</Text>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={colors.greenDark} />
                </View>
              </AppCard>
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}

const FILTERS = [
  ['all', 'All'],
  ['one_time', 'One Time'],
  ['subscription', 'Subscription'],
  ['past', 'Past'],
] as const;

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: spacing.sm, marginBottom: 14, flexWrap: 'wrap' },
  emptyMessage: { marginTop: 6 },
  emptyAction: { marginTop: spacing.xs },
  orderCard: { padding: 15, marginBottom: 10 },
  orderTop: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  orderNumber: { flexShrink: 1, fontWeight: '900', color: colors.ink },
  orderStatus: { fontWeight: '800', color: colors.greenDark },
  summary: { fontWeight: '800', color: colors.ink, marginTop: spacing.sm },
  meta: { color: colors.inkSoft, marginTop: 5 },
  metaTight: { color: colors.inkSoft, marginTop: 3 },
  detailsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  detailsLink: { color: colors.greenDark, fontWeight: '800' },
});
