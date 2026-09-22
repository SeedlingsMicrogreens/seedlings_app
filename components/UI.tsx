import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../constants/theme';
import type { Product } from '../services/products/productService';
import { useAppStore } from '../store/appStore';

export function Screen({ children, scroll = true }: { children: React.ReactNode; scroll?: boolean }) {
  const insets = useSafeAreaInsets();
  const content = <View style={styles.screen}>{children}</View>;
  const scrollStyle = [styles.scroll, { paddingBottom: 96 + insets.bottom }];
  return scroll ? <ScrollView style={styles.root} contentContainerStyle={scrollStyle} showsVerticalScrollIndicator={false}>{content}</ScrollView> : <View style={styles.root}>{content}</View>;
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return <View style={styles.pageTitleWrap}>
    <Text style={styles.pageTitle}>{title}</Text>
    {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
  </View>;
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {action && onAction ? <Pressable onPress={onAction} hitSlop={8}><Text style={styles.sectionAction}>{action}</Text></Pressable> : null}
  </View>;
}

export function Logo({ size = 110 }: { size?: number }) {
  return <Image source={require('../assets/logo.png')} style={{ width: size, height: size * 0.803 }} resizeMode="contain" />;
}

export function Button({ title, onPress, secondary = false, orange = false, disabled = false }: { title: string; onPress: () => void; secondary?: boolean; orange?: boolean; disabled?: boolean }) {
  return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, secondary && styles.secondaryButton, orange && styles.orangeButton, disabled && styles.disabledButton, pressed && !disabled && styles.pressed]}>
    <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{title}</Text>
  </Pressable>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function ProductCard({ product, onPress }: { product: Product; onPress: () => void }) {
  const addToCart = useAppStore((s) => s.addToCart);
  const source = product.imageUrl?.startsWith('http') ? { uri: product.imageUrl } : require('../assets/products/placeholder.png');
  const hasDiscount = Boolean(product.mrp && product.mrp > product.price);
  return (
    <View style={styles.productCard}>
      <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.pressedSoft]}>
        <View style={styles.productImageWrap}><Image source={source} style={styles.productImage} resizeMode="contain" /></View>
        <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
        {product.weightGrams ? <Text style={styles.productMeta}>{product.defaultWeight}</Text> : null}
      </Pressable>
      <View style={styles.priceRow}>
        <View style={styles.priceGroup}>
          <Text style={styles.price}>₹{product.price}</Text>
          {hasDiscount ? <Text style={styles.mrp}>₹{product.mrp}</Text> : null}
        </View>
        {product.oneTimePurchase ? <Pressable accessibilityRole="button" accessibilityLabel={`Add ${product.name} to cart`} onPress={() => addToCart(product)} style={styles.addButton}><Text style={styles.addText}>+</Text></Pressable> : null}
      </View>
      {hasDiscount ? <Text style={styles.saving}>Save ₹{Math.max(0, Number(product.mrp) - product.price)}</Text> : null}
    </View>
  );
}

export function SearchBar({ value, onChangeText }: { value: string; onChangeText: (v: string) => void }) {
  return <View style={styles.searchWrap}>
    <Text style={styles.searchIcon}>⌕</Text>
    <TextInput value={value} onChangeText={onChangeText} placeholder="Search microgreens, recipes…" placeholderTextColor={colors.inkFaint} style={styles.search} returnKeyType="search" />
    {value ? <Pressable onPress={() => onChangeText('')} hitSlop={8}><Text style={styles.clearSearch}>×</Text></Pressable> : null}
  </View>;
}

export function Chip({ label, selected, accent = 'green', onPress }: { label: string; selected?: boolean; accent?: 'green' | 'orange'; onPress: () => void }) {
  const selectedBorder = accent === 'orange' ? colors.orange : colors.greenDark;
  const selectedBg = accent === 'orange' ? colors.orangeTint : colors.greenTint;
  const selectedText = accent === 'orange' ? colors.orangeDark : colors.greenDark;
  return <Pressable onPress={onPress} style={[styles.chip, selected && { borderColor: selectedBorder, backgroundColor: selectedBg }]}><Text style={[styles.chipText, selected && { color: selectedText, fontWeight: '900' }]}>{label}</Text></Pressable>;
}

export function EmptyState({ title, message, action, onAction }: { title: string; message?: string; action?: string; onAction?: () => void }) {
  return <Card style={styles.emptyState}>
    <View style={styles.emptyIcon}><Text style={styles.emptyIconText}>🌿</Text></View>
    <Text style={styles.emptyTitle}>{title}</Text>
    {message ? <Text style={styles.emptyMessage}>{message}</Text> : null}
    {action && onAction ? <View style={styles.emptyAction}><Button title={action} onPress={onAction} /></View> : null}
  </Card>;
}

export const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  scroll: { paddingBottom: 112 },
  screen: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  pageTitleWrap: { marginTop: spacing.sm, marginBottom: spacing.md },
  pageTitle: { fontFamily: typography.fontFamily, fontSize: typography.h1, lineHeight: 30, fontWeight: '900', color: colors.ink },
  pageSubtitle: { fontFamily: typography.fontFamily, color: colors.inkSoft, fontSize: typography.bodySmall, lineHeight: 18, marginTop: 3 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: spacing.md },
  sectionTitle: { fontFamily: typography.fontFamily, fontSize: typography.h2, fontWeight: '900', color: colors.ink },
  sectionAction: { fontFamily: typography.fontFamily, color: colors.greenDark, fontSize: typography.bodySmall, fontWeight: '900' },
  button: { minHeight: 48, borderRadius: 14, backgroundColor: colors.greenDark, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  buttonText: { fontFamily: typography.fontFamily, color: colors.white, fontSize: typography.button, fontWeight: '900' },
  secondaryButton: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line },
  secondaryButtonText: { color: colors.greenDark },
  orangeButton: { backgroundColor: colors.orange },
  disabledButton: { backgroundColor: colors.line },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  pressedSoft: { opacity: 0.86 },
  card: { backgroundColor: colors.panel, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.lineSoft, padding: spacing.lg, marginBottom: spacing.md },
  searchWrap: { height: 52, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.lineSoft, borderRadius: 15, paddingHorizontal: 13, marginTop: 2 },
  searchIcon: { fontFamily: typography.fontFamily, fontSize: 20, color: colors.greenDark, width: 24, textAlign: 'center' },
  search: { flex: 1, height: 50, paddingHorizontal: 7, color: colors.ink, fontFamily: typography.fontFamily, fontSize: typography.body },
  clearSearch: { fontSize: 22, lineHeight: 24, color: colors.inkFaint, paddingLeft: 5 },
  productCard: { width: '48.4%', backgroundColor: colors.panel, borderRadius: 18, borderWidth: 1, borderColor: colors.lineSoft, padding: 9, marginBottom: 12, overflow: 'hidden' },
  productImageWrap: { height: 130, borderRadius: 13, backgroundColor: colors.block, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  productImage: { width: '100%', height: '100%' },
  productName: { color: colors.ink, fontFamily: typography.fontFamily, fontSize: 14, fontWeight: '900', marginTop: 9, minHeight: 36, lineHeight: 18 },
  productMeta: { color: colors.inkSoft, fontFamily: typography.fontFamily, fontSize: 11, marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 9, minHeight: 34 },
  priceGroup: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flex: 1, flexWrap: 'wrap' },
  price: { color: colors.ink, fontFamily: typography.fontFamily, fontSize: 16, fontWeight: '900' },
  mrp: { color: colors.inkFaint, fontFamily: typography.fontFamily, fontSize: 11, textDecorationLine: 'line-through' },
  saving: { color: colors.greenDark, fontFamily: typography.fontFamily, fontSize: 11, fontWeight: '800', marginTop: 2 },
  soldOut: { color: colors.danger, fontFamily: typography.fontFamily, fontSize: 10, fontWeight: '800' },
  addButton: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.greenDark, alignItems: 'center', justifyContent: 'center', marginLeft: 5 },
  addText: { color: colors.white, fontFamily: typography.fontFamily, fontSize: 23, fontWeight: '700', lineHeight: 25 },
  chip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line },
  chipText: { fontFamily: typography.fontFamily, fontSize: 12, fontWeight: '800', color: colors.inkSoft },
  emptyState: { alignItems: 'center', paddingVertical: 30, marginTop: spacing.md },
  emptyIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.greenTint, alignItems: 'center', justifyContent: 'center' },
  emptyIconText: { fontSize: 26 },
  emptyTitle: { fontFamily: typography.fontFamily, fontSize: 18, fontWeight: '900', color: colors.ink, marginTop: 12, textAlign: 'center' },
  emptyMessage: { fontFamily: typography.fontFamily, color: colors.inkSoft, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 5, maxWidth: 290 },
  emptyAction: { width: 190, marginTop: 14 },
});
