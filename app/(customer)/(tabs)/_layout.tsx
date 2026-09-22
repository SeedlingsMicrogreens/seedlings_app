import { Tabs } from 'expo-router';
import { Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography } from '../../../constants/theme';
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
        <View style={[styles.cartIcon, active ? styles.cartIconActive : styles.cartIconInactive]}>
          <MaterialCommunityIcons name="cart-outline" size={active ? 25 : 24} color={colors.white} />
        </View>
      ) : (
        <MaterialCommunityIcons name={iconName} size={active ? 24 : 23} color={active ? colors.greenDark : colors.inkFaint} />
      )}
      {badge && badge > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text></View> : null}
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const cartCount = useAppStore((s) => s.cart.reduce((sum, item) => sum + item.quantity, 0) + s.subscriptionCart.reduce((sum, item) => sum + item.quantity, 0));
  const tabBarHeight = 84 + insets.bottom;

  return (
    <Tabs screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: colors.greenDark,
      tabBarInactiveTintColor: colors.inkSoft,
      tabBarStyle: {
        height: tabBarHeight,
        paddingBottom: insets.bottom,
        paddingTop: 4,
        backgroundColor: colors.panel,
        borderTopColor: colors.lineSoft,
        borderTopWidth: 1,
        overflow: 'visible',
      },
      tabBarLabelStyle: {
        fontFamily: typography.fontFamily,
        fontSize: 11,
        fontWeight: '700',
        lineHeight: 13,
        marginTop: 0,
      },
      tabBarIconStyle: {
        height: 44,
        marginTop: 0,
        marginBottom: 0,
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

const styles = {
  iconSlot: {
    width: 56,
    height: 56,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    position: 'relative' as const,
    overflow: 'visible' as const,
  },
  cartIcon: {
    width: 54,
    height: 54,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 27,
    backgroundColor: colors.greenDark,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cartIconActive: {
    transform: [{ translateY: -8 }],
  },
  cartIconInactive: {
    transform: [{ translateY: -5 }],
  },
  badge: {
    position: 'absolute' as const,
    top: 0,
    right: 0,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: colors.orange,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2,
    borderColor: colors.panel,
  },
  badgeText: {
    color: colors.white,
    fontFamily: typography.fontFamily,
    fontSize: 9,
    fontWeight: '900' as const,
    lineHeight: 12,
  },
};
