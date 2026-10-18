import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { AppCard, AppIconButton, AppText, BottomSheet, Button, Screen } from '../../../components/UI';
import { colors, radius, spacing, typography } from '../../../constants/theme';
import { useAppStore } from '../../../store/appStore';
import { getCustomerSubscriptions, type CustomerSubscription } from '../../../services/subscriptions/subscriptionService';
import { filterPaidCalendarDeliveries, filterPaidCalendarSubscriptions } from '../../../services/subscriptions/calendarPaymentFilter';
import { getCustomerOrders, type CustomerOrder } from '../../../services/orders/orderService';
import { getCustomerSubscriptionDeliveries, updateSubscriptionDelivery, type SubscriptionDelivery } from '../../../services/subscriptions/subscriptionDeliveryService';

const parseDate = (value?: string) => {
  if (!value) return undefined;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
};
const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const formatDate = (value: string) => parseDate(value)?.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) || value;
const monthTitle = (d: Date) => d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
const addDays = (value: string, days: number) => { const d = parseDate(value); if (!d) return ''; d.setDate(d.getDate() + days); return dateKey(d); };
const todayKey = () => dateKey(new Date());
const nextSaturday = (value: string) => { const d = parseDate(value); if (!d) return ''; const offset = (6 - d.getDay() + 7) % 7 || 7; d.setDate(d.getDate() + offset); return dateKey(d); };

function buildFutureEvents(subscriptions: CustomerSubscription[], month: Date) {
  const start = dateKey(new Date(month.getFullYear(), month.getMonth(), 1));
  const end = dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const events: Array<{ date: string; subscription: CustomerSubscription; status: string; number: number }> = [];
  subscriptions.forEach((sub) => {
    if (!['active', 'paused'].includes(String(sub.status || '').toLowerCase())) return;
    let date = sub.nextDeliveryDate || '';
    const remaining = Math.max(0, Number(sub.totalDeliveries || 0) - Number(sub.deliveriesGenerated || 0));
    for (let i = 0; i < remaining && date; i += 1) {
      if (date >= start && date <= end) events.push({ date, subscription: sub, status: 'upcoming', number: Number(sub.deliveriesGenerated || 0) + i + 1 });
      if (date > end) break;
      date = addDays(date, 7);
    }
  });
  return events;
}

function statusColor(status: string) {
  const value = status.toLowerCase();
  if (value === 'delivered') return colors.greenDark;
  if (value === 'skipped') return colors.inkSoft;
  if (value === 'rescheduled') return colors.orange;
  if (value === 'failed' || value === 'cancelled') return colors.danger;
  return colors.green;
}

export default function DeliveryCalendar() {
  const mobile = useAppStore(s => s.mobile);
  const [subs, setSubs] = useState<CustomerSubscription[]>([]);
  const [deliveries, setDeliveries] = useState<SubscriptionDelivery[]>([]);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState<{ subscription: CustomerSubscription; date: string; number: number } | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  const load = async () => {
    if (!mobile) { router.replace('/(customer)/auth/login'); return; }
    setLoading(true); setError('');
    try {
      const [subscriptionData, deliveryData, orderData] = await Promise.all([
        getCustomerSubscriptions(mobile),
        getCustomerSubscriptionDeliveries(mobile),
        getCustomerOrders(mobile),
      ]);
      setSubs(subscriptionData);
      setDeliveries(deliveryData);
      setOrders(orderData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load delivery calendar.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [mobile]);

  const paidSubs = useMemo(() => filterPaidCalendarSubscriptions(subs), [subs]);
  const future = useMemo(() => buildFutureEvents(paidSubs, month), [paidSubs, month]);
  const paidDeliveries = useMemo(() => filterPaidCalendarDeliveries(deliveries, paidSubs, orders), [deliveries, paidSubs, orders]);
  const actual = useMemo(() => paidDeliveries.filter(d => d.deliveryDate && d.deliveryDate.startsWith(`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`)), [paidDeliveries, month]);
  const byDate = useMemo(() => {
    const map = new Map<string, Array<{ status: string; label: string; subscription?: CustomerSubscription; delivery?: SubscriptionDelivery; number?: number }>>();
    future.forEach(e => map.set(e.date, [...(map.get(e.date) || []), { status: e.status, label: 'Upcoming', subscription: e.subscription, number: e.number }]));
    actual.forEach(d => map.set(d.deliveryDate!, [...(map.get(d.deliveryDate!) || []), { status: d.status || 'assigned', label: String(d.status || 'assigned').replace(/_/g, ' '), delivery: d }]));
    return map;
  }, [future, actual]);

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return Array.from({ length: offset + days }, (_, i) => {
      if (i < offset) return null;
      const d = new Date(month.getFullYear(), month.getMonth(), i - offset + 1);
      return { key: dateKey(d), day: d.getDate(), events: byDate.get(dateKey(d)) || [] };
    });
  }, [month, byDate]);

  const action = async (type: 'reschedule', newDate?: string) => {
    if (!selected || !mobile) return;
    if (selected.date <= todayKey()) {
      Alert.alert('Delivery cannot be rescheduled', 'Only future subscription deliveries can be rescheduled.');
      return;
    }
    setBusy(true);
    try {
      await updateSubscriptionDelivery({ subscriptionId: selected.subscription.id, action: type, deliveryDate: selected.date, ...(newDate ? { newDate } : {}) });
      setSelected(null); setRescheduleOpen(false);
      await load();
      Alert.alert('Delivery rescheduled', `Your delivery is now scheduled for ${formatDate(newDate || '')}.`);
    } catch (e) {
      Alert.alert('Unable to update delivery', e instanceof Error ? e.message : 'Please try again.');
    } finally { setBusy(false); }
  };

  const rescheduleDates = useMemo(() => {
    if (!selected) return [] as string[];
    const result: string[] = [];
    let cursor = nextSaturday(selected.date);
    const end = selected.subscription.endDate || '';
    for (let i = 0; i < 12 && cursor; i += 1) {
      if ((!end || cursor <= end) && cursor > selected.date) result.push(cursor);
      if (result.length >= 2) break;
      cursor = addDays(cursor, 7);
    }
    return result;
  }, [selected]);

  const confirmReschedule = (date: string) => {
    Alert.alert(
      'Confirm reschedule',
      `Move this delivery from ${formatDate(selected?.date || '')} to ${formatDate(date)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => void action('reschedule', date) },
      ],
      { cancelable: true },
    );
  };

  return <Screen>
    <View style={styles.titleRow}>
      <View style={styles.flex}><AppText variant="h1">Delivery Calendar</AppText><AppText variant="bodySmall" style={styles.subtitle}>Track upcoming subscription deliveries and delivery history.</AppText></View>
    </View>

    {loading ? <View style={styles.center}><ActivityIndicator size="large" color={colors.green} /><AppText variant="bodySmall" style={styles.subtitle}>Loading delivery schedule…</AppText></View> : error ? <AppCard><AppText style={styles.error}>{error}</AppText><View style={styles.sheetSecondary}><Button title="Try Again" onPress={() => void load()} /></View></AppCard> : !paidSubs.length && !paidDeliveries.length ? <AppCard><AppText variant="h2">No subscription deliveries</AppText><AppText variant="bodySmall" style={styles.subtitle}>Your scheduled subscription deliveries will appear here.</AppText></AppCard> : <>
      <AppCard style={styles.calendarCard}>
        <View style={styles.calendarHeader}><AppIconButton accessibilityLabel="Previous month" onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><MaterialCommunityIcons name="chevron-left" size={28} color={colors.greenDark} /></AppIconButton><AppText variant="h2">{monthTitle(month)}</AppText><AppIconButton accessibilityLabel="Next month" onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><MaterialCommunityIcons name="chevron-right" size={28} color={colors.greenDark} /></AppIconButton></View>
        <View style={styles.weekHeader}>{['M','T','W','T','F','S','S'].map((d, i) => <Text key={`${d}-${i}`} style={styles.weekDay}>{d}</Text>)}</View>
        <View style={styles.grid}>{cells.map((cell, i) => cell ? <Pressable key={cell.key} accessibilityRole="button" accessibilityLabel={`${cell.key}${cell.events.length ? `, ${cell.events.length} deliver${cell.events.length === 1 ? 'y' : 'ies'}` : ''}`} onPress={() => { const event = cell.events.find(e => e.subscription && e.status === 'upcoming'); if (event?.subscription) setSelected({ subscription: event.subscription, date: cell.key, number: event.number || 0 }); }} style={[styles.day, cell.key === todayKey() && styles.today, cell.events.length > 0 && styles.hasEvent]}>{cell.day ? <Text style={styles.dayNumber}>{cell.day}</Text> : null}{cell.events.slice(0, 2).map((e, index) => <View key={`${cell.key}-${index}`} style={[styles.dot, { backgroundColor: statusColor(e.status) }]} />)}</Pressable> : <View key={`empty-${i}`} style={styles.day} />)}</View>
        <View style={styles.legend}><View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: statusColor('upcoming') }]} /><Text style={styles.legendText}>Upcoming</Text></View><View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: statusColor('delivered') }]} /><Text style={styles.legendText}>Actual</Text></View></View>
      </AppCard>

      <AppText variant="h2" style={styles.sectionTitle}>Delivery Journey</AppText>
      {subs.map(sub => {
        const related = deliveries.filter(d => d.subscriptionId === sub.id).sort((a,b) => String(a.deliveryDate).localeCompare(String(b.deliveryDate)));
        const next = sub.nextDeliveryDate;
        return <AppCard key={sub.id} style={styles.journeyCard}><AppText variant="h2">{sub.productName || 'Subscription'}</AppText><AppText variant="bodySmall" style={styles.subtitle}>{sub.sellingOptionLabel || 'Pack'} × {sub.quantity || 1} · {sub.frequency || ''}</AppText><View style={styles.progress}><View style={[styles.progressFill, { width: `${Math.min(100, ((sub.deliveriesGenerated || 0) / Math.max(1, sub.totalDeliveries || 1)) * 100)}%` }]} /></View><Text style={styles.progressText}>{sub.deliveriesGenerated || 0} of {sub.totalDeliveries || 0} deliveries completed</Text>{next ? <View style={styles.nextBox}><Text style={styles.nextLabel}>NEXT DELIVERY</Text><Text style={styles.nextDate}>{formatDate(next)}</Text></View> : null}{related.slice(-4).map(d => <View key={d.id} style={styles.timelineRow}><View style={[styles.timelineDot, { backgroundColor: statusColor(d.status || '') }]} /><View style={styles.flex}><Text style={styles.timelineDate}>{formatDate(d.deliveryDate || '')}</Text><Text style={styles.timelineStatus}>{String(d.status || 'scheduled').replace(/_/g, ' ')}</Text></View></View>)}</AppCard>;
      })}
    </>}

    <BottomSheet visible={Boolean(selected)} animation="slide" closeOnBackdrop={false} onClose={() => { if (!busy) setSelected(null); }}>
      {selected ? <>
        <AppText variant="h2">Delivery {selected.number || ''}</AppText>
        <AppText variant="bodySmall" style={styles.subtitle}>{formatDate(selected.date)} · {selected.subscription.productName || 'Subscription'}</AppText>
        <View style={styles.sheetPrimary}><Button title="Reschedule Delivery" disabled={busy || selected.date <= todayKey()} onPress={() => setRescheduleOpen(true)} /></View>
        <View style={styles.sheetSecondary}><Button title="Close" secondary disabled={busy} onPress={() => setSelected(null)} /></View>
      </> : null}
    </BottomSheet>

    <BottomSheet visible={rescheduleOpen} animation="slide" closeOnBackdrop={false} onClose={() => { if (!busy) setRescheduleOpen(false); }}>
      <AppText variant="h2">Choose new Saturday</AppText>
      <AppText variant="bodySmall" style={styles.subtitle}>Select a later delivery date within your subscription period.</AppText>
      {rescheduleDates.map(date => <Pressable key={date} accessibilityRole="button" accessibilityLabel={`Reschedule to ${formatDate(date)}`} accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => confirmReschedule(date)} style={styles.dateOption}><Text style={styles.dateOptionText}>{formatDate(date)}</Text><MaterialCommunityIcons name="chevron-right" size={22} color={colors.inkSoft} /></Pressable>)}
      {!rescheduleDates.length ? <AppText variant="bodySmall" style={styles.subtitle}>No eligible future delivery dates are available.</AppText> : null}
      <View style={styles.sheetSecondary}><Button title="Back" secondary disabled={busy} onPress={() => setRescheduleOpen(false)} /></View>
    </BottomSheet>
  </Screen>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  sheetPrimary: { marginTop: 18 },
  sheetSecondary: { marginTop: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.lg },
  subtitle: { color: colors.inkSoft, marginTop: 5 },
  center: { alignItems: 'center', paddingVertical: 60 },
  error: { color: colors.danger, fontWeight: '800' },
  calendarCard: { padding: 14 },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  weekHeader: { flexDirection: 'row' },
  weekDay: { width: '14.2857%', textAlign: 'center', fontSize: 11, fontWeight: '800', color: colors.inkSoft, paddingVertical: 7 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  day: { width: '14.2857%', minHeight: 48, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 5, borderRadius: 10 },
  today: { backgroundColor: colors.greenTint },
  hasEvent: { borderWidth: 1, borderColor: colors.lineSoft },
  dayNumber: { fontFamily: typography.fontFamily, color: colors.ink, fontSize: 12, fontWeight: '800' },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 4 },
  legend: { flexDirection: 'row', gap: 12, marginTop: 12 },
  legendText: { fontSize: 10, color: colors.inkSoft },
  sectionTitle: { marginTop: spacing.lg, marginBottom: spacing.sm },
  journeyCard: { marginBottom: spacing.md },
  progress: { height: 8, borderRadius: 4, backgroundColor: colors.block, overflow: 'hidden', marginTop: 14 },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: colors.green },
  progressText: { fontSize: 11, color: colors.inkSoft, marginTop: 6 },
  nextBox: { backgroundColor: colors.greenTint, borderRadius: radius.md, padding: 12, marginTop: 12 },
  nextLabel: { fontSize: 9, fontWeight: '900', color: colors.greenDark, letterSpacing: 0.7 },
  nextDate: { fontSize: 14, fontWeight: '900', color: colors.ink, marginTop: 3 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  timelineDot: { width: 9, height: 9, borderRadius: 5, marginRight: 10 },
  timelineDate: { fontSize: 13, fontWeight: '800', color: colors.ink },
  timelineStatus: { fontSize: 11, color: colors.inkSoft, marginTop: 2, textTransform: 'capitalize' },
  dateOption: { minHeight: 50, borderWidth: 1, borderColor: colors.lineSoft, borderRadius: 12, paddingHorizontal: 14, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateOptionText: { color: colors.ink, fontSize: 14, fontWeight: '800' },
});
