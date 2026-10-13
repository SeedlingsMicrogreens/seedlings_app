import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, elevation, layout, typography } from '../../../constants/theme';
import { AppBadge } from '../../../components/UI';
import { getCartItemCount } from '../../../services/cart/cartService';
import { useAppStore } from '../../../store/appStore';

const tabIcons = {
  index: 'home-outline',
  products: 'storefront-outline',
  cart: 'cart-outline',
  orders: 'package-variant-closed',
  profile: 'account-outline',
} as const;

function TabIcon({ routeName, active, badge }: { routeName: keyof typeof tabIcons; active: boolean; badge?: number }) {
  const isCart = routeName === 'cart';
  const iconName = tabIcons[routeName];
  return (
    <View style={styles.iconSlot}>
      {isCart ? (
        <View style={styles.cartIcon}>
          <MaterialCommunityIcons name="cart-outline" size={active ? 25 : 24} color={colors.white} />
        </View>
      ) : (
        <MaterialCommunityIcons name={iconName} size={active ? 24 : 23} color={active ? colors.greenDark : colors.inkFaint} />
      )}
      {badge && badge > 0 ? <AppBadge style={styles.badge}>{badge > 99 ? '99+' : badge}</AppBadge> : null}
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const cartCount = useAppStore((s) => getCartItemCount(s.cart, s.subscriptionCart));
  const tabBarHeight = layout.tabBarHeight + insets.bottom;

  return (
    <Tabs screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: colors.greenDark,
      tabBarInactiveTintColor: colors.inkSoft,
      tabBarStyle: {
        height: tabBarHeight,
        paddingBottom: insets.bottom,
        paddingTop: 6,
        backgroundColor: colors.panel,
        borderTopColor: colors.lineSoft,
        borderTopWidth: 1,
        overflow: 'visible',
        zIndex: 100,
        elevation: 8,
      },
      tabBarLabelStyle: {
        fontFamily: typography.fontFamily,
        fontSize: 11,
        fontWeight: '700',
        lineHeight: 13,
        marginTop: 0,
      },
      tabBarIconStyle: {
        height: ICON_SLOT_HEIGHT,
        marginTop: 0,
        marginBottom: 1,
      },
      tabBarItemStyle: {
        height: '100%',
        flex: 1,
        paddingTop: 3,
      },
      tabBarIcon: ({ focused }) => {
        return <TabIcon routeName={route.name as keyof typeof tabIcons} active={focused} badge={route.name === 'cart' ? cartCount : undefined} />;
      },
    })}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="products" options={{ title: 'Shop' }} />
      <Tabs.Screen name="cart" options={{ title: 'Cart' }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders' }} />
      <Tabs.Screen name="profile" options={{ title: 'Account' }} />
    </Tabs>
  );
}

// The icon slot matches tabBarIconStyle.height so icons never overflow into the label. The 44dp cart circle is
// raised so its bottom edge aligns with the slot bottom (it protrudes upward instead of covering the "Cart" label).
const ICON_SLOT_HEIGHT = 28;
const CART_CIRCLE = 44;

const styles = StyleSheet.create({
  iconSlot: {
    width: CART_CIRCLE,
    height: ICON_SLOT_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  cartIcon: {
    ...elevation.sm,
    position: 'absolute',
    bottom: 0,
    width: CART_CIRCLE,
    height: CART_CIRCLE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: CART_CIRCLE / 2,
    backgroundColor: colors.greenDark,
  },
  badge: { position: 'absolute', top: -CART_CIRCLE + ICON_SLOT_HEIGHT, right: -2, borderWidth: 2, borderColor: colors.panel },
});
