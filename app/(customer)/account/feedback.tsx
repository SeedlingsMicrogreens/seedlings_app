import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { AppCard, AppInput, AppText, Button, Chip, ErrorState, LoadingState, Screen } from '../../../components/UI';
import { colors, layout, radius, spacing } from '../../../constants/theme';
import { useAppStore } from '../../../store/appStore';
import { getCustomerOrders, type CustomerOrder } from '../../../services/orders/orderService';
import {
  createCustomerFeedback,
  getCustomerFeedback,
  getFeedbackForOrder,
  FEEDBACK_ALLOWED_IMAGE_TYPES,
  FEEDBACK_LIKE_OPTIONS,
  DELIVERY_PARTNER_FEEDBACK_OPTIONS,
  FEEDBACK_MAX_IMAGES,
  FEEDBACK_MAX_IMAGE_BYTES,
  type CustomerFeedback,
  type FeedbackImage,
} from '../../../services/feedback/feedbackService';

function dateText(value: unknown) {
  if (!value) return '';
  try {
    const d = typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as any).toDate === 'function' ? (value as any).toDate() : new Date(value as any);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

function isDelivered(order: CustomerOrder) {
  return String(order.deliveryStatus ?? order.status ?? '').toLowerCase() === 'delivered';
}

function orderLabel(order: CustomerOrder) {
  return `${order.orderNumber || order.id.slice(0, 8)}${order.createdAt ? ` · ${dateText(order.createdAt)}` : ''}`;
}

export default function FeedbackScreen() {
  const mobile = useAppStore((s) => s.mobile);
  const params = useLocalSearchParams<{ orderId?: string }>();
  const requestedOrderId = Array.isArray(params.orderId) ? params.orderId[0] : params.orderId;
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [items, setItems] = useState<CustomerFeedback[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState(requestedOrderId || '');
  const [existing, setExisting] = useState<CustomerFeedback | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [positiveFeedback, setPositiveFeedback] = useState<string[]>([]);
  const [deliveryPartnerFeedback, setDeliveryPartnerFeedback] = useState<string[]>([]);
  const [images, setImages] = useState<FeedbackImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const deliveredOrders = useMemo(() => orders.filter(isDelivered), [orders]);
  const selectedOrder = deliveredOrders.find((o) => o.id === selectedOrderId);
  const selectedPartnerId = String(selectedOrder?.deliveryPartnerId ?? selectedOrder?.assignedDeliveryPartnerId ?? '');

  const load = useCallback(async (refresh = false) => {
    if (!mobile) { router.replace('/(customer)/auth/login'); return; }
    if (refresh) setLoading(true); else setLoading(true);
    setError('');
    try {
      const [feedback, customerOrders] = await Promise.all([getCustomerFeedback(mobile), getCustomerOrders(mobile)]);
      setItems(feedback);
      setOrders(customerOrders);
      const delivered = customerOrders.filter(isDelivered);
      if (!selectedOrderId || !delivered.some((o) => o.id === selectedOrderId)) setSelectedOrderId(delivered[0]?.id || '');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load feedback.'); }
    finally { setLoading(false); }
  }, [mobile, selectedOrderId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let active = true;
    if (!selectedOrderId) { setExisting(null); return; }
    void getFeedbackForOrder(selectedOrderId).then((value) => { if (active) setExisting(value); }).catch(() => { if (active) setExisting(null); });
    return () => { active = false; };
  }, [selectedOrderId, items]);

  const toggle = (value: string, setter: (next: string[]) => void, current: string[]) => setter(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);

  const choosePhotos = async () => {
    try {
      if (images.length >= FEEDBACK_MAX_IMAGES) { setError(`You can attach up to ${FEEDBACK_MAX_IMAGES} photos.`); return; }
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { setError('Photo access is required to attach feedback photos.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: FEEDBACK_MAX_IMAGES - images.length, quality: 0.8 });
      if (result.canceled) return;
      const selected = result.assets.slice(0, FEEDBACK_MAX_IMAGES - images.length).map((asset) => ({ uri: asset.uri, mimeType: asset.mimeType, fileSize: asset.fileSize, fileName: asset.fileName }));
      const invalid = selected.find((image) => {
        const mime = String(image.mimeType ?? '').toLowerCase();
        const name = String(image.fileName ?? '').toLowerCase();
        const valid = FEEDBACK_ALLOWED_IMAGE_TYPES.includes(mime as any) || /\.(png|jpe?g)$/.test(name);
        return !valid || (typeof image.fileSize === 'number' && image.fileSize > FEEDBACK_MAX_IMAGE_BYTES);
      });
      if (invalid) { setError('Only PNG/JPG/JPEG photos up to 5 MB each are allowed.'); return; }
      setImages((current) => [...current, ...selected].slice(0, FEEDBACK_MAX_IMAGES));
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to select photos.'); }
  };

  const submit = async () => {
    if (!mobile || !selectedOrderId) { setError('Please select a delivered order.'); return; }
    if (!rating) { setError('Please select a rating from 1 to 5.'); return; }
    if (existing) { setError('Feedback has already been submitted for this delivery.'); return; }
    setSaving(true); setError('');
    try {
      await createCustomerFeedback({ mobile, orderId: selectedOrderId, rating, comment, positiveFeedback: positiveFeedback as any, deliveryPartnerFeedback: deliveryPartnerFeedback as any, images });
      setRating(0); setComment(''); setPositiveFeedback([]); setDeliveryPartnerFeedback([]); setImages([]);
      await load(true);
      Alert.alert('Feedback submitted', 'Thank you for sharing your experience.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to submit feedback.'); }
    finally { setSaving(false); }
  };

  return <Screen>
    <View style={styles.title}><AppText variant="h1">Feedback</AppText><AppText variant="bodySmall" style={styles.muted}>Share your experience after a delivered order.</AppText></View>

    {loading ? <LoadingState label="Loading feedback…" /> : error && !deliveredOrders.length ? <ErrorState message={error} onRetry={() => void load()} retryLabel="Try Again" /> : !deliveredOrders.length ? <AppCard><AppText variant="h2">No delivered orders yet</AppText><AppText variant="bodySmall" style={styles.muted}>Feedback becomes available after an order is marked Delivered.</AppText></AppCard> : <>
      <AppCard>
        <AppText variant="h3">Delivered order</AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {deliveredOrders.map((order) => <Chip key={order.id} label={orderLabel(order)} selected={selectedOrderId === order.id} onPress={() => { setSelectedOrderId(order.id); setError(''); }} />)}
        </ScrollView>
      </AppCard>

      {existing ? <AppCard>
        <AppText variant="h2">Feedback submitted</AppText>
        <AppText variant="bodySmall" style={styles.muted}>Thank you. Your feedback for this delivery has already been recorded.</AppText>
        <View style={styles.starRow} accessibilityLabel={`Rated ${existing.rating} of 5`}>{[1,2,3,4,5].map((n) => <MaterialCommunityIcons key={n} name="star" size={28} color={n <= existing.rating ? colors.orange : colors.line} />)}</View>
        {existing.comment ? <AppText style={styles.comment}>{existing.comment}</AppText> : null}
      </AppCard> : <AppCard>
        <AppText variant="h2">How was your experience?</AppText>
        <AppText variant="bodySmall" style={styles.muted}>Rate the delivered order and tell us what you liked.</AppText>
        <AppText variant="caption" style={styles.label}>RATING *</AppText>
        <View style={styles.starRow}>{[1,2,3,4,5].map((n) => <Pressable key={n} onPress={() => setRating(n)} accessibilityRole="button" accessibilityLabel={`${n} star rating`} accessibilityState={{ selected: n <= rating }} style={styles.starButton}><MaterialCommunityIcons name="star" size={34} color={n <= rating ? colors.orange : colors.line} /></Pressable>)}</View>

        <AppText variant="caption" style={styles.label}>WHAT DID YOU LIKE?</AppText>
        <View style={styles.wrap}>{FEEDBACK_LIKE_OPTIONS.map((option) => <Chip key={option.key} label={option.label} selected={positiveFeedback.includes(option.key)} onPress={() => toggle(option.key, setPositiveFeedback, positiveFeedback)} />)}</View>

        {selectedPartnerId ? <><AppText variant="caption" style={styles.label}>DELIVERY PARTNER</AppText><View style={styles.wrap}>{DELIVERY_PARTNER_FEEDBACK_OPTIONS.map((option) => <Chip key={option.key} label={option.label} selected={deliveryPartnerFeedback.includes(option.key)} onPress={() => toggle(option.key, setDeliveryPartnerFeedback, deliveryPartnerFeedback)} />)}</View></> : null}

        <AppText variant="caption" style={styles.label}>COMMENTS</AppText>
        <AppInput value={comment} onChangeText={setComment} multiline maxLength={1000} placeholder="Tell us what we can improve." accessibilityLabel="Comments" />

        <View style={styles.photoHeader}><AppText variant="caption" style={styles.label}>PHOTOS</AppText><AppText variant="caption" style={styles.muted}>{images.length}/{FEEDBACK_MAX_IMAGES}</AppText></View>
        <View style={styles.photoRow}>
          {images.map((image, index) => <View key={`${image.uri}-${index}`} style={styles.photoWrap}><Image source={{ uri: image.uri }} style={styles.photo} /><Pressable onPress={() => setImages((current) => current.filter((_, i) => i !== index))} style={styles.removePhoto} hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove photo ${index + 1}`}><MaterialCommunityIcons name="close" size={16} color={colors.white} /></Pressable></View>)}
          {images.length < FEEDBACK_MAX_IMAGES ? <Pressable onPress={() => void choosePhotos()} style={styles.addPhoto} accessibilityRole="button" accessibilityLabel="Add photo"><MaterialCommunityIcons name="camera-plus-outline" size={22} color={colors.greenDark} /><AppText style={styles.addPhotoText}>Add Photo</AppText></Pressable> : null}
        </View>
        <AppText variant="caption" style={styles.photoHint}>PNG/JPG/JPEG · max 5 MB each</AppText>

        {error ? <AppText variant="bodySmall" style={styles.error}>{error}</AppText> : null}
        <View style={styles.submit}><Button title={saving ? 'Submitting…' : 'Submit Feedback'} onPress={() => void submit()} loading={saving} /></View>
      </AppCard>}

      <AppText variant="h2" style={styles.historyTitle}>Your feedback</AppText>
      {items.length === 0 ? <AppCard><AppText variant="bodySmall" style={styles.muted}>Your submitted feedback will appear here.</AppText></AppCard> : items.map((item) => <AppCard key={item.id}><View style={styles.historyTop}><AppText variant="h3">{item.orderId.slice(0, 8)}</AppText><AppText variant="caption">{dateText(item.createdAt)}</AppText></View><View style={styles.starRow} accessibilityLabel={`Rated ${item.rating} of 5`}>{[1,2,3,4,5].map((n) => <MaterialCommunityIcons key={n} name="star" size={22} color={n <= item.rating ? colors.orange : colors.line} />)}</View>{item.comment ? <AppText style={styles.comment}>{item.comment}</AppText> : null}</AppCard>)}
    </>}
    {error && deliveredOrders.length ? <AppText variant="bodySmall" style={[styles.error, styles.errorSpaced]}>{error}</AppText> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  submit: { marginTop: spacing.md },
  errorSpaced: { marginTop: spacing.sm },
  starButton: { minWidth: layout.minTouch, minHeight: layout.minTouch, alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: spacing.sm, marginBottom: spacing.md },
  muted: { color: colors.inkSoft },
  error: { color: colors.danger, marginTop: 6 },
  chips: { gap: 8, paddingVertical: 12 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  label: { color: colors.inkSoft, fontWeight: '900', marginTop: spacing.lg, marginBottom: 6 },
  starRow: { flexDirection: 'row', gap: 2, marginTop: 8, alignItems: 'center' },
  comment: { marginTop: 10, color: colors.ink, lineHeight: 20 },
  photoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  photoWrap: { width: 84, height: 84, position: 'relative' },
  photo: { width: 84, height: 84, borderRadius: 12 },
  removePhoto: { position: 'absolute', right: -5, top: -5, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  removeText: { color: colors.white, fontSize: 18, lineHeight: 20 },
  addPhoto: { width: 84, height: 84, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  addPhotoText: { color: colors.greenDark, fontWeight: '900', textAlign: 'center', fontSize: 11, marginTop: 2 },
  photoHint: { color: colors.inkFaint, marginTop: 6 },
  historyTitle: { marginTop: spacing.md, marginBottom: spacing.sm },
  historyTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
});
