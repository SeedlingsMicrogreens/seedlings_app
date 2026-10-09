import { Alert, StyleSheet, View } from 'react-native';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { AppCard, AppText, Button, LoadingState, PageTitle, Screen } from '../../../components/UI';
import { colors } from '../../../constants/theme';
import { useAppStore } from '../../../store/appStore';
import { getCustomerSubscriptions, prettySubscriptionStatus, updateCustomerSubscription, type CustomerSubscription } from '../../../services/subscriptions/subscriptionService';

export default function Subscriptions() {
  const mobile = useAppStore((s) => s.mobile);
  const [subs, setSubs] = useState<CustomerSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!mobile) {
      router.replace('/(customer)/auth/login');
      return;
    }
    setLoading(true);
    try {
      setSubs(await getCustomerSubscriptions(mobile));
    } catch (error) {
      Alert.alert('Unable to load subscriptions', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [mobile]);

  const update = (subscription: CustomerSubscription, action: 'pause' | 'resume' | 'cancel') => {
    if (!mobile) return;
    const labels = { pause: 'Pause', resume: 'Resume', cancel: 'Cancel' } as const;
    const label = labels[action];
    const message = action === 'pause'
      ? 'Future subscription deliveries will remain on the subscription but the subscription will be paused until you resume it.'
      : action === 'resume'
        ? 'This will resume the subscription.'
        : 'This will permanently cancel the subscription. It cannot be resumed after cancellation.';
    Alert.alert(`${label} subscription?`, message, [
      { text: 'No', style: 'cancel' },
      { text: label, style: action === 'cancel' ? 'destructive' : 'default', onPress: () => void (async () => {
        setBusy(true);
        try {
          await updateCustomerSubscription({ mobile, subscriptionId: subscription.id, action });
          await load();
        } catch (error) {
          Alert.alert(`${label} failed`, error instanceof Error ? error.message : 'Please try again.');
        } finally { setBusy(false); }
      }) },
    ]);
  };

  if (loading) return <Screen><LoadingState label="Loading subscriptions…" /></Screen>;

  return <Screen>
    <PageTitle title="My Subscriptions" subtitle="Manage your existing subscription deliveries here. Choose subscription plans from a product page." />

    {subs.length ? subs.map((subscription) => {
      const status = String(subscription.status ?? '').toLowerCase();
      const canPause = status === 'active';
      const canResume = status === 'paused';
      const canCancel = status === 'active' || status === 'paused';
      return <AppCard key={subscription.id} style={styles.card}>
        <View style={styles.row}>
          <View style={styles.copy}>
            <AppText variant="h3">{subscription.productName || 'Subscription'}</AppText>
            <AppText variant="bodySmall" style={styles.muted}>{subscription.sellingOptionLabel || 'Pack'} × {subscription.quantity || 1} · {subscription.frequency || 'Subscription'} · Saturday delivery</AppText>
          </View>
          <AppText variant="bodySmall" style={styles.status}>{prettySubscriptionStatus(subscription.status)}</AppText>
        </View>
        <AppText variant="bodySmall" style={styles.muted}>Next delivery: <AppText variant="bodySmall" style={styles.bold}>{subscription.nextDeliveryDate || '—'}</AppText></AppText>
        <AppText variant="bodySmall" style={styles.muted}>Remaining deliveries: <AppText variant="bodySmall" style={styles.bold}>{subscription.remainingDeliveries ?? '—'}</AppText></AppText>
        {(canPause || canResume || canCancel) ? <View style={styles.actions}>
          {canPause ? <Button title="Pause" secondary disabled={busy} onPress={() => update(subscription, 'pause')} style={styles.actionButton} /> : null}
          {canResume ? <Button title="Resume" disabled={busy} onPress={() => update(subscription, 'resume')} style={styles.actionButton} /> : null}
          {canCancel ? <Button title="Cancel" secondary disabled={busy} onPress={() => update(subscription, 'cancel')} style={styles.actionButton} /> : null}
        </View> : null}
      </AppCard>;
    }) : <AppCard>
      <AppText variant="h2">No subscriptions yet</AppText>
      <AppText variant="bodySmall" style={styles.muted}>Open a subscription-eligible product to choose a plan and start date.</AppText>
      <View style={styles.shopButton}><Button title="Shop Fresh" onPress={() => router.push('/(customer)/(tabs)/products')} /></View>
    </AppCard>}

    <View style={styles.calendarButton}><Button title="View Delivery Calendar" secondary onPress={() => router.push('/(customer)/account/delivery-calendar')} /></View>
  </Screen>;
}

const styles = StyleSheet.create({
  card: { marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  copy: { flex: 1, minWidth: 0 },
  muted: { color: colors.inkSoft, marginTop: 5, lineHeight: 20 },
  bold: { fontWeight: '900', color: colors.ink },
  status: { color: colors.greenDark, fontWeight: '900' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  actionButton: { flex: 1 },
  shopButton: { marginTop: 14 },
  calendarButton: { marginTop: 4, marginBottom: 20 },
});
