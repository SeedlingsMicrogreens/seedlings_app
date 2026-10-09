import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { AppCard, AppText, Button, EmptyState, ErrorState, LoadingState, PageTitle, Screen } from '../../../components/UI';
import { colors, spacing } from '../../../constants/theme';
import { CustomerNotification, markAllCustomerNotificationsRead, markCustomerNotificationRead, subscribeToCustomerNotifications } from '../../../services/notifications/notificationService';
import { getStoredCustomerMobile } from '../../../services/clientOnboarding';

function formatDate(value: unknown) {
  if (!value) return '';
  try {
    const date = typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as any).toDate === 'function' ? (value as any).toDate() : new Date(value as any);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
}

function openNotification(item: CustomerNotification) {
  if (item.orderId) router.push(`/(customer)/order/${item.orderId}` as any);
  else if (item.subscriptionId) router.push('/(customer)/account/subscriptions' as any);
}

export default function ScreenPage() {
  const [items, setItems] = useState<CustomerNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    const mobile = getStoredCustomerMobile();
    if (!mobile) { setItems([]); setLoading(false); return; }
    if (refresh) { setRefreshing(true); setError(''); }
    else setLoading(true);
    const unsubscribe = subscribeToCustomerNotifications(mobile, (next) => {
      setItems(next);
      setLoading(false);
      setRefreshing(false);
    }, (e) => {
      setError(e.message || 'Unable to load notifications.');
      setLoading(false);
      setRefreshing(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    void (async () => { unsubscribe = await load(); })();
    return () => unsubscribe?.();
  }, [load]);

  const unread = items.filter((item) => !item.read).length;

  const handleOpen = async (item: CustomerNotification) => {
    if (!item.read) {
      try { await markCustomerNotificationRead(item.id); } catch {}
    }
    openNotification(item);
  };

  const handleMarkAll = async () => {
    try { await markAllCustomerNotificationsRead(items); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to mark notifications as read.'); }
  };

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} colors={[colors.greenDark]} tintColor={colors.greenDark} />}>
      <PageTitle title="Notifications" subtitle={unread ? `${unread} unread notification${unread === 1 ? '' : 's'}` : 'You’re all caught up'} />
      {unread > 0 ? <View style={styles.markAll}><Button title="Mark all as read" secondary onPress={() => void handleMarkAll()} /></View> : null}
      {loading ? <LoadingState /> : error ? <ErrorState message={error} /> : items.length === 0 ? <EmptyState title="No notifications" message="You’ll see order, delivery and subscription updates here." /> : items.map((item) => (
        <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.read ? '' : 'New: '}${item.title}`} onPress={() => void handleOpen(item)}>
          <AppCard style={item.read ? undefined : styles.unreadCard}>
            <View style={styles.row}>
              <View style={[styles.dot, !item.read && styles.dotUnread]} />
              <View style={styles.copy}>
                <View style={styles.titleRow}>
                  <AppText variant="h3" style={styles.title}>{item.title}</AppText>
                  {!item.read ? <AppText variant="caption" style={styles.newLabel}>NEW</AppText> : null}
                </View>
                {!!item.message && <AppText variant="bodySmall" style={styles.message}>{item.message}</AppText>}
                {!!item.createdAt && <AppText variant="caption" style={styles.date}>{formatDate(item.createdAt)}</AppText>}
              </View>
            </View>
          </AppCard>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  markAll: { marginBottom: spacing.md },
  unreadCard: { borderColor: colors.green, backgroundColor: colors.greenTint },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.line, marginTop: 6 },
  dotUnread: { backgroundColor: colors.greenDark },
  copy: { flex: 1 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  title: { flex: 1 },
  newLabel: { color: colors.greenDark, fontWeight: '900' },
  message: { marginTop: 6, color: colors.ink },
  date: { marginTop: spacing.sm },
});
