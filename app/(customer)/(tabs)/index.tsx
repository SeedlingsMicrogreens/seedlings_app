import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LoadingState, ProductCard, Screen, SearchBar, SectionHeader, usePressedState } from '../../../components/UI';
import { colors, radius, spacing, typography } from '../../../constants/theme';
import { getProducts } from '../../../services/products/productService';
import type { Product } from '../../../services/products/productService';
import { useAppStore } from '../../../store/appStore';
import { getCustomerProfile } from '../../../services/customerProfile';

export default function Home() {
  const [q, setQ] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [name, setName] = useState('');
  const mobile = useAppStore((s) => s.mobile);
  const heroPress = usePressedState();

  useEffect(() => {
    let alive = true;
    void getProducts().then(r => {
      if (alive) setProducts(r.products);
    }).catch(() => { if (alive) setProducts([]); }).finally(() => { if (alive) setProductsLoaded(true); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!mobile) return;
    let alive = true;
    void getCustomerProfile(mobile).then(profile => { if (alive) setName(profile.name || ''); }).catch(() => {});
    return () => { alive = false; };
  }, [mobile]);

  const popular = products.filter(p => p.popular).filter(p => p.name.toLowerCase().includes(q.toLowerCase()));
  return <Screen>
    <View style={styles.greeting}>
      <Text style={styles.eyebrow}>Fresh from Seedlings</Text>
      <Text style={styles.greetingTitle}>Hello{name ? `, ${name.split(' ')[0]}` : ''}! 🌿</Text>
    </View>
    <SearchBar value={q} onChangeText={setQ} />

    <View style={styles.hero}>
      <View style={styles.heroCopy}>
        <Text style={styles.heroKicker}>FRESH • LOCAL • WEEKLY</Text>
        <Text style={styles.heroTitle}>Small Greens.{`\n`}Big Nutrition.</Text>
        <Text style={styles.heroText}>Freshly harvested microgreens delivered with care.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Shop Fresh" onPress={() => router.push('/(customer)/(tabs)/products')} {...heroPress.pressHandlers} style={[styles.heroButton, heroPress.pressed && styles.heroButtonPressed]}><Text style={styles.heroButtonText}>Shop Fresh</Text></Pressable>
      </View>
      <MaterialCommunityIcons name="sprout" size={92} color={colors.white} style={styles.heroLeaf} />
    </View>

    <View style={styles.quickRow}>
      <Pressable accessibilityRole="button" accessibilityLabel="One Time: Fresh this weekend" onPress={() => router.push('/(customer)/(tabs)/products')} style={[styles.quickCard, styles.quickGreen]}>
        <Text style={styles.quickTitle}>One Time</Text><Text style={styles.quickText}>Fresh this weekend</Text><MaterialCommunityIcons name="arrow-right" size={20} color={colors.greenDark} style={styles.quickArrow} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Subscriptions: Save on every delivery" onPress={() => router.push('/(customer)/account/subscriptions')} style={[styles.quickCard, styles.quickOrange]}>
        <Text style={[styles.quickTitle, styles.quickTitleOrange]}>Subscriptions</Text><Text style={styles.quickText}>Save on every delivery</Text><MaterialCommunityIcons name="arrow-right" size={20} color={colors.orangeDark} style={styles.quickArrow} />
      </Pressable>
    </View>

    <SectionHeader title="Popular Products" action="View all" onAction={() => router.push('/(customer)/(tabs)/products')} />
    {!productsLoaded ? <LoadingState label="Loading fresh products…" /> : null}
    <View style={styles.grid}>{popular.slice(0, 4).map(p => <ProductCard key={p.id} product={p} onPress={() => router.push({ pathname: '/(customer)/product/[id]', params: { id: p.id } })} />)}</View>
  </Screen>;
}

const styles = StyleSheet.create({
  greeting: { marginTop: spacing.sm, marginBottom: spacing.sm },
  eyebrow: { fontFamily: typography.fontFamily, color: colors.greenDark, fontSize: 11, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  greetingTitle: { fontFamily: typography.fontFamily, color: colors.ink, fontSize: 23, fontWeight: '900', marginTop: 2 },
  hero: { marginTop: spacing.md, minHeight: 190, backgroundColor: colors.greenDark, borderRadius: radius.xl, padding: spacing.xl, overflow: 'hidden', position: 'relative' },
  heroCopy: { maxWidth: '82%' },
  heroKicker: { fontFamily: typography.fontFamily, color: colors.greenTint, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  heroTitle: { fontFamily: typography.fontFamily, color: colors.white, fontSize: 24, lineHeight: 28, fontWeight: '900', marginTop: 7 },
  heroText: { fontFamily: typography.fontFamily, color: colors.panel, fontSize: 12, lineHeight: 18, marginTop: 7 },
  heroButton: { alignSelf: 'flex-start', backgroundColor: colors.white, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.pill, marginTop: 14 },
  heroButtonPressed: { opacity: 0.82 },
  heroButtonText: { fontFamily: typography.fontFamily, color: colors.greenDeep, fontSize: 12, fontWeight: '900' },
  heroLeaf: { position: 'absolute', right: -5, bottom: -18, opacity: 0.17 },
  quickRow: { flexDirection: 'row', gap: 10, marginTop: spacing.md },
  quickCard: { flex: 1, minHeight: 92, borderRadius: radius.lg, padding: spacing.md, position: 'relative' },
  quickGreen: { backgroundColor: colors.greenTint },
  quickOrange: { backgroundColor: colors.orangeTint },
  quickTitle: { fontFamily: typography.fontFamily, color: colors.greenDark, fontSize: 14, fontWeight: '900' },
  quickText: { fontFamily: typography.fontFamily, color: colors.inkSoft, fontSize: 11, marginTop: 3, maxWidth: '85%' },
  quickTitleOrange: { color: colors.orangeDark },
  quickArrow: { position: 'absolute', right: 12, bottom: 11 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
});
