import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Chip, ErrorState, LoadingState, PageTitle, ProductCard, Screen, SearchBar } from '../../../components/UI';
import { colors, spacing, typography } from '../../../constants/theme';
import { getProducts } from '../../../services/products/productService';
import type { Product } from '../../../services/products/productService';

export default function Products() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [mood, setMood] = useState('All');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = async (forceRefresh = false) => {
    try {
      setError('');
      if (forceRefresh) setRefreshing(true); else setLoading(true);
      const result = await getProducts({ forceRefresh });
      setProducts(result.products);
    } catch { setError('Unable to load products. Please try again.'); }
    finally { setLoading(false); setRefreshing(false); }
  };
  useEffect(() => { void load(); }, []);

  const categories = useMemo(() => ['All', ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))], [products]);
  const moods = useMemo(() => ['All', ...Array.from(new Set(products.flatMap((p) => p.moods).filter(Boolean)))], [products]);
  const list = products.filter((p) => (cat === 'All' || p.category === cat) && (mood === 'All' || p.moods.some((value) => value.toLowerCase() === mood.toLowerCase())) && p.name.toLowerCase().includes(q.toLowerCase()));

  return <Screen>
    <PageTitle title="Products" subtitle="Fresh microgreens, ready for your table." />
    <SearchBar value={q} onChangeText={setQ} />

    <Text style={styles.filterLabel}>Category</Text>
    <View style={styles.chips}>{categories.map((c) => <Chip key={c} label={c} selected={cat === c} onPress={() => setCat(c)} />)}</View>

    {moods.length > 1 ? <><Text style={styles.filterLabel}>Shop by mood</Text><View style={styles.chips}>{moods.map((m) => <Chip key={m} label={m} selected={mood === m} accent="orange" onPress={() => setMood(m)} />)}</View></> : null}

    {loading ? <LoadingState label="Loading fresh products…" /> : error ? <View style={styles.stateBlock}><ErrorState message={error} onRetry={() => void load(true)} retryLabel={refreshing ? 'Refreshing…' : 'Retry'} /></View> : list.length === 0 ? <View style={styles.state}><Text style={styles.noTitle}>No products found</Text><Text style={styles.stateText}>Try another search or category.</Text></View> : <View style={styles.grid}>{list.map((p) => <ProductCard key={p.id} product={p} onPress={() => router.push({ pathname: '/(customer)/product/[id]', params: { id: p.id } })} />)}</View>}
  </Screen>;
}

const styles = StyleSheet.create({
  filterLabel: { fontFamily: typography.fontFamily, fontSize: 12, fontWeight: '900', color: colors.inkSoft, marginTop: spacing.lg, marginBottom: 7 },
  chips: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: spacing.lg },
  stateBlock: { marginTop: spacing.lg },
  state: { alignItems: 'center', paddingVertical: 52 },
  stateText: { fontFamily: typography.fontFamily, color: colors.inkSoft, fontSize: 13, marginTop: 9, textAlign: 'center' },
  noTitle: { fontFamily: typography.fontFamily, color: colors.ink, fontSize: 17, fontWeight: '900' },
});
