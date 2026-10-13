import { router, Stack, usePathname } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { useBackNavigation } from '../../components/backNavigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, layout, spacing, typography } from '../../constants/theme';
import { AppBadge, AppText } from '../../components/UI';
import { getCustomerAddresses } from '../../services/customerAddresses';
import { CUSTOMER_NOTIFICATIONS_ROUTE, notificationUnreadBadgeLabel, notificationUnreadCount, subscribeToCustomerNotifications } from '../../services/notifications/notificationService';
import { useAppStore } from '../../store/appStore';

const ROOT_TAB_PATHS = new Set(['/', '/products', '/cart', '/orders', '/profile']);

function CustomerHeader() {
  const { handleBack } = useBackNavigation();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const mobile = useAppStore((state) => state.mobile);
  const [addressLabel, setAddressLabel] = useState('Add delivery address');
  const [unreadBadgeLabel, setUnreadBadgeLabel] = useState<string | null>(null);

  // usePathname() returns URL paths without route groups, e.g. '/cart' for (customer)/(tabs)/cart.
  const isRootTab = ROOT_TAB_PATHS.has(pathname);

  useEffect(() => {
    let alive = true;
    if (!mobile) {
      setAddressLabel('Add delivery address');
      return () => { alive = false; };
    }

    void getCustomerAddresses(mobile)
      .then((addresses) => {
        if (!alive) return;
        const address = addresses[0];
        if (address) {
          setAddressLabel(`${address.label || 'Home'} · ${address.pincode || address.city || ''}`.replace(/ · $/, ''));
        } else {
          setAddressLabel('Add delivery address');
        }
      })
      .catch(() => {
        if (alive) setAddressLabel('Add delivery address');
      });

    return () => { alive = false; };
  }, [mobile]);

  useEffect(() => {
    let alive = true;
    setUnreadBadgeLabel(null);
    if (!mobile) return () => { alive = false; };

    const unsubscribe = subscribeToCustomerNotifications(
      mobile,
      (items) => {
        if (alive) setUnreadBadgeLabel(notificationUnreadBadgeLabel(notificationUnreadCount(items)));
      },
      () => {
        if (alive) setUnreadBadgeLabel(null);
      },
    );

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [mobile]);

  return (
    <View style={[styles.header, { paddingTop: insets.top, height: layout.headerHeight + insets.top }]}>
      <View style={styles.left}>
        {!isRootTab ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={handleBack} hitSlop={4} style={styles.backButton}>
            <MaterialCommunityIcons name="chevron-left" size={30} color={colors.ink} />
          </Pressable>
        ) : null}
        <AppText variant="h2" style={styles.brand} maxFontSizeMultiplier={typography.controlMaxFontScale}>Seedlings</AppText>
      </View>
      <View style={styles.deliveryGroup}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unreadBadgeLabel ? `Notifications, ${unreadBadgeLabel} unread` : 'Notifications'}
          onPress={() => router.push(CUSTOMER_NOTIFICATIONS_ROUTE)}
          hitSlop={4}
          style={styles.notificationButton}
        >
          <MaterialCommunityIcons name="bell-outline" size={22} color={colors.greenDark} />
          {unreadBadgeLabel ? <AppBadge style={styles.notificationBadge}>{unreadBadgeLabel}</AppBadge> : null}
        </Pressable>
        <View style={styles.delivery}>
          <AppText variant="caption" style={styles.deliveryCaption} maxFontSizeMultiplier={typography.controlMaxFontScale}>DELIVER TO</AppText>
          <View style={styles.deliveryRow}><MaterialCommunityIcons name="map-marker-outline" size={13} color={colors.greenDark} style={styles.pin} /><AppText variant="bodySmall" style={styles.deliveryValue} numberOfLines={1} maxFontSizeMultiplier={typography.controlMaxFontScale}>{addressLabel}</AppText><MaterialCommunityIcons name="chevron-down" size={14} color={colors.inkSoft} style={styles.chevron} /></View>
        </View>
      </View>
    </View>
  );
}

export default function CustomerLayout() {
  const authenticated = useAppStore((state) => state.authenticated);
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.shell}>
      {authenticated ? <CustomerHeader /> : null}
      <View style={[styles.content, authenticated && { paddingTop: layout.headerHeight + insets.top }]}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.paper },
  content: { flex: 1 },
  header: {
    zIndex: 100,
    elevation: 4,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: layout.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenHorizontal,
    backgroundColor: colors.paper,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  left: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  backButton: { width: layout.minTouch, height: layout.minTouch, alignItems: 'flex-start', justifyContent: 'center', marginLeft: -spacing.sm, marginRight: 2 },
  brand: { fontSize: 21, fontWeight: '900', color: colors.greenDark, letterSpacing: -0.3 },
  deliveryGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, maxWidth: '62%', flexShrink: 1 },
  notificationButton: { width: layout.minTouch, height: layout.minTouch, alignItems: 'center', justifyContent: 'center' },
  notificationBadge: { position: 'absolute', top: 0, right: 0, borderWidth: 1.5, borderColor: colors.paper },
  delivery: { alignItems: 'flex-end', flexShrink: 1 },
  deliveryCaption: { fontSize: 9, color: colors.inkSoft, fontWeight: '800', letterSpacing: 0.7 },
  deliveryRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, maxWidth: '100%' },
  pin: { marginRight: 3 },
  deliveryValue: { fontSize: 11, fontWeight: '900', color: colors.ink, flexShrink: 1 },
  chevron: { marginLeft: 2 },
});
