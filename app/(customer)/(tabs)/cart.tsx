import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { AppCard, Button, EmptyState, LoadingState, OptionCard, PageTitle, QuantityStepper, Screen, SelectField, SelectSheet } from '../../../components/UI';
import { colors, radius, spacing } from '../../../constants/theme';
import { getProducts, type Product, type ProductSellingOption } from '../../../services/products/productService';
import { getActiveSubscriptionPlans, type SubscriptionPlan, type SubscriptionPlanSellingOption } from '../../../services/subscriptions/subscriptionService';
import { resolvePriceDisplay, scalePriceDisplay } from '../../../services/products/priceDisplay';
import { useAppStore } from '../../../store/appStore';

const money = (value: number, currency = 'INR') => {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value) || 0);
  } catch {
    return `₹${Math.round(Number(value) || 0)}`;
  }
};
const weightLabel = (grams: number) => grams >= 1000 && grams % 1000 === 0 ? `${grams / 1000}kg` : `${grams}g`;
const parseWeight = (value?: string) => { const v = String(value ?? '').toLowerCase().trim(); const n = Number.parseFloat(v); return Number.isFinite(n) ? (v.endsWith('kg') ? n * 1000 : n) : 0; };
const nextWeekSaturday = () => { const d = new Date(); const day = d.getDay(); const add = ((6 - day + 7) % 7) || 7; d.setDate(d.getDate() + add); return d.toISOString().slice(0, 10); };

type Mode = 'one-time' | 'subscription';
type Group = { productId: string; oneTime?: ReturnType<typeof useAppStore.getState>['cart'][number]; subscription?: ReturnType<typeof useAppStore.getState>['subscriptionCart'][number] };
type CartStore = ReturnType<typeof useAppStore.getState>;
type SubscriptionEntry = { plan: SubscriptionPlan; option: SubscriptionPlanSellingOption | undefined };

type CartProductCardProps = {
  group: Group;
  product: Product | undefined;
  plans: SubscriptionPlan[];
  remove: CartStore['removeFromCart'];
  removeSubscription: CartStore['removeSubscriptionFromCart'];
  change: CartStore['changeQuantity'];
  changeSubscription: CartStore['changeSubscriptionQuantity'];
  replaceSelection: CartStore['replaceProductCartSelection'];
};

function PackagingSelector({ value, options, onChange }: { value: number; options: ProductSellingOption[]; onChange: (grams: number) => void }) {
  const [open, setOpen] = useState(false);
  const current = options.find((x) => Number(x.weightGrams) === value);
  return <>
    <SelectField label="Packaging" value={current ? weightLabel(Number(current.weightGrams)) : weightLabel(value)} onPress={() => setOpen(true)} accessibilityLabel="Packaging selector" />
    <SelectSheet visible={open} onClose={() => setOpen(false)} title="Select Packaging" options={options.map((option) => ({ key: String(option.weightGrams), label: weightLabel(Number(option.weightGrams)), selected: Number(option.weightGrams) === value }))} onSelect={(key) => { onChange(Number(key)); setOpen(false); }} />
  </>;
}

export default function Cart() {
  const cart = useAppStore((s) => s.cart);
  const subscriptionCart = useAppStore((s) => s.subscriptionCart);
  const remove = useAppStore((s) => s.removeFromCart);
  const removeSubscription = useAppStore((s) => s.removeSubscriptionFromCart);
  const change = useAppStore((s) => s.changeQuantity);
  const changeSubscription = useAppStore((s) => s.changeSubscriptionQuantity);
  const replaceSelection = useAppStore((s) => s.replaceProductCartSelection);
  const [products, setProducts] = useState<Product[]>([]);
  const [plans, setPlans] = useState<Record<string, SubscriptionPlan[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { let active = true; void getProducts().then(({ products: loaded }) => { if (active) setProducts(loaded); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  useEffect(() => { let active = true; const ids = [...new Set([...cart.map((x) => x.id), ...subscriptionCart.map((x) => x.id)])]; if (!ids.length) { setPlans({}); return; } Promise.all(ids.map(async (id) => [id, await getActiveSubscriptionPlans(id).catch(() => [])] as const)).then((entries) => { if (active) setPlans(Object.fromEntries(entries)); }); return () => { active = false; }; }, [cart, subscriptionCart]);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const groups = useMemo<Group[]>(() => { const map = new Map<string, Group>(); for (const item of cart) map.set(item.id, { ...(map.get(item.id) ?? { productId: item.id }), oneTime: item }); for (const item of subscriptionCart) map.set(item.id, { ...(map.get(item.id) ?? { productId: item.id }), subscription: item }); return [...map.values()].sort((a, b) => Number((a.oneTime ?? a.subscription)?.cartPosition ?? 0) - Number((b.oneTime ?? b.subscription)?.cartPosition ?? 0)); }, [cart, subscriptionCart]);

  if (loading && !groups.length) return <Screen><LoadingState label="Loading your cart…" /></Screen>;
  if (!groups.length) return <Screen><EmptyState title="Your cart is empty" message="Add fresh microgreens from the catalogue to get started." action="Start Shopping" onAction={() => router.push('/(customer)/(tabs)/products')} /></Screen>;

  return <Screen>
    <PageTitle title="Your Cart" subtitle={`${groups.length} ${groups.length === 1 ? 'item' : 'items'}`} />
    {groups.map((group) => <CartProductCard key={group.productId} group={group} product={productMap.get(group.productId)} plans={plans[group.productId] ?? []} remove={remove} removeSubscription={removeSubscription} change={change} changeSubscription={changeSubscription} replaceSelection={replaceSelection} />)}
    <View style={styles.checkoutAction}><Button title="Proceed to Checkout" onPress={() => router.push('/checkout')} /></View>
  </Screen>;
}

function CartProductCard({ group, product, plans, remove, removeSubscription, change, changeSubscription, replaceSelection }: CartProductCardProps) {
  const current = group.oneTime ?? group.subscription;
  const [mode, setMode] = useState<Mode>(group.oneTime ? 'one-time' : 'subscription');
  const [packaging, setPackaging] = useState(parseWeight(current?.selectedWeight) || Number(product?.defaultWeight?.replace(/[^0-9.]/g, '')) || 100);
  const planId = group.subscription?.planId ?? '';
  const selectedPlan = plans.find((p: SubscriptionPlan) => p.id === planId) ?? plans[0];
  const productOptions = (product?.sellingOptions ?? []).filter((x: ProductSellingOption) => x.active !== false && Number(x.weightGrams) > 0).sort((a: ProductSellingOption,b: ProductSellingOption) => Number(a.weightGrams)-Number(b.weightGrams));
  const fallback = productOptions.length ? productOptions : [{ id: 'fallback', weightGrams: packaging, price: Number(current?.price ?? product?.price ?? 0), mrp: Number(current?.mrp ?? product?.mrp ?? current?.price ?? 0), active: true } as ProductSellingOption];
  const subscriptionEntries: SubscriptionEntry[] = plans.map((plan) => ({ plan, option: (plan.sellingOptions ?? []).find((option) => Number(option.weightGrams) === packaging && Number(option.planPrice) >= 0) }));
  const quantity = Number(current?.quantity ?? 1);
  const currency = product?.currency || current?.currency || 'INR';
  const oneTimeOption = fallback.find((option) => Number(option.weightGrams) === packaging) ?? fallback[0];
  const oneTimePrice = Number(group.oneTime?.price ?? oneTimeOption.price ?? 0);
  const oneTimeMrp = Number(oneTimeOption.mrp) > 0 ? oneTimeOption.mrp : group.oneTime?.mrp;
  const oneTimePriceDisplay = resolvePriceDisplay(oneTimePrice, oneTimeMrp);
  const selectedPlanEntry = subscriptionEntries.find((entry) => entry.plan.id === planId)
    ?? subscriptionEntries.find((entry) => entry.option);
  const subscriptionPrice = Number(group.subscription?.price ?? selectedPlanEntry?.option?.planPrice ?? 0);
  const subscriptionPriceDisplay = resolvePriceDisplay(
    subscriptionPrice,
    selectedPlanEntry?.option?.maximumPlanPrice,
  );
  const selectedUnitPrice = mode === 'one-time' ? oneTimePrice : subscriptionPrice;
  const selectedPriceDisplay = mode === 'one-time' ? oneTimePriceDisplay : subscriptionPriceDisplay;
  const selectedTotalPriceDisplay = scalePriceDisplay(selectedPriceDisplay, quantity);
  const image = product?.imageUrl?.startsWith('http') ? { uri: product.imageUrl } : require('../../../assets/products/placeholder.png');

  useEffect(() => { setMode(group.oneTime ? 'one-time' : 'subscription'); const w = parseWeight((group.oneTime ?? group.subscription)?.selectedWeight); if (w) setPackaging(w); }, [group.oneTime?.id, group.oneTime?.selectedWeight, group.subscription?.planId, group.subscription?.selectedWeight]);
  const renderOptionPrice = (price: number, referencePrice: unknown) => {
    const display = resolvePriceDisplay(price, referencePrice);
    return <View style={styles.optionPriceStack}>
      {display.originalPrice !== undefined ? <Text style={styles.optionMrp}>MRP {money(display.originalPrice, currency)}</Text> : null}
      <Text style={styles.optionSale}>{money(price, currency)}</Text>
      {display.savings !== undefined ? <Text style={styles.optionSaving}>Save {money(display.savings, currency)}</Text> : null}
    </View>;
  };

  const applyPackaging = (grams: number) => {
    setPackaging(grams);
    if (mode === 'one-time') {
      const option = fallback.find((candidate) => Number(candidate.weightGrams) === grams); if (!option || !group.oneTime) return;
      useAppStore.getState().setCartPackaging(group.oneTime.id, grams, Number(option.price), Number(option.mrp), option.id, weightLabel(grams));
      return;
    }
    const entry = subscriptionEntries.find((candidate) => candidate.option && Number(candidate.option.weightGrams) === grams);
    if (!entry || !group.subscription) return;
    useAppStore.getState().setSubscriptionCartPackaging(group.subscription.id, entry.plan.id, group.subscription.startDate, grams, Number(entry.option?.planPrice ?? entry.plan.price), String(entry.option?.sellingOptionId ?? entry.option?.id ?? ''), weightLabel(grams), entry.option?.maximumPlanPrice);
  };

  const selectOneTime = () => { const option = fallback.find((candidate) => Number(candidate.weightGrams) === packaging) ?? fallback[0]; if (!product || !option) return; replaceSelection({ product, mode: 'one-time', quantity, startDate: group.subscription?.startDate, plan: undefined }); setMode('one-time'); setPackaging(Number(option.weightGrams)); };
  const selectSubscription = (nextPlan: SubscriptionPlan) => { const entry = (nextPlan.sellingOptions ?? []).find((x) => Number(x.weightGrams) === packaging && Number(x.planPrice) >= 0) ?? (nextPlan.sellingOptions ?? []).find((x) => Number(x.planPrice) >= 0); if (!product || !entry) return; replaceSelection({ product, mode: 'subscription', quantity, startDate: group.subscription?.startDate || nextWeekSaturday(), plan: { id: nextPlan.id, name: nextPlan.name, frequency: nextPlan.frequency, deliveriesPerTerm: nextPlan.deliveriesPerTerm, price: Number(entry.planPrice), maximumPlanPrice: entry.maximumPlanPrice, sellingOptionId: String(entry.sellingOptionId ?? entry.id ?? ''), sellingOptionLabel: weightLabel(Number(entry.weightGrams)), weightGrams: Number(entry.weightGrams) } }); setMode('subscription'); setPackaging(Number(entry.weightGrams)); };
  const decrease = () => {
    if (mode === 'one-time') {
      if (quantity <= 1) remove(group.productId);
      else change(group.productId, -1);
      return;
    }
    if (!group.subscription) return;
    if (quantity <= 1) removeSubscription(group.productId, group.subscription.planId, group.subscription.startDate);
    else changeSubscription(group.productId, group.subscription.planId, group.subscription.startDate, -1);
  };
  const increase = () => {
    if (mode === 'one-time') {
      change(group.productId, 1);
      return;
    }
    if (group.subscription) changeSubscription(group.productId, group.subscription.planId, group.subscription.startDate, 1);
  };

  const productName = product?.name ?? current?.name ?? 'Product';
  const currentStartDate = mode === 'subscription' ? group.subscription?.startDate : undefined;
  return <AppCard style={styles.card}>
    <View style={styles.productRow}><Image source={image} style={styles.image} resizeMode="contain" accessibilityIgnoresInvertColors /><View style={styles.productCopy}><Text style={styles.name}>{productName}</Text>{currentStartDate ? <Text style={styles.meta}>Starts {currentStartDate}</Text> : null}</View></View>
    <PackagingSelector value={packaging} options={fallback} onChange={applyPackaging} />
    <View style={styles.purchaseList}>
      <OptionCard title="One-time purchase" subtitle="Buy once" trailing={renderOptionPrice(Number(oneTimeOption.price), oneTimePriceDisplay.originalPrice)} selected={mode === 'one-time'} onPress={selectOneTime} />
      {subscriptionEntries.map(({ plan, option }) => <OptionCard key={plan.id} title={plan.name || 'Subscription'} subtitle={Number(plan.deliveriesPerTerm ?? 0) > 0 ? `${Number(plan.deliveriesPerTerm)} deliveries / term` : 'Recurring deliveries'} trailing={option ? renderOptionPrice(Number(option.planPrice), option.maximumPlanPrice) : 'Not available'} selected={mode === 'subscription' && plan.id === planId} disabled={!option} onPress={() => selectSubscription(plan)} />)}
    </View>
    <View style={styles.bottomRow}>
      <QuantityStepper quantity={quantity} onDecrease={decrease} onIncrease={increase} itemLabel={productName} />
      <View style={styles.totalPriceStack}>
        {selectedTotalPriceDisplay.originalPrice !== undefined ? <Text style={styles.lineMrp}>{money(selectedTotalPriceDisplay.originalPrice, currency)}{mode === 'subscription' ? ' / term' : ''}</Text> : null}
        <Text style={styles.linePrice}>{money(selectedUnitPrice * quantity, currency)}{mode === 'subscription' ? ' / term' : ''}</Text>
        {selectedTotalPriceDisplay.savings !== undefined ? <Text style={styles.lineSaving}>Save {money(selectedTotalPriceDisplay.savings, currency)}</Text> : null}
      </View>
    </View>
  </AppCard>;
}

const styles = StyleSheet.create({
  card: { padding: 13, marginBottom: 14 },
  productRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  productCopy: { flex: 1, marginLeft: spacing.md },
  image: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.block },
  name: { color: colors.ink, fontSize: 17, fontWeight: '900' },
  meta: { color: colors.inkSoft, fontSize: 11, marginTop: 4 },
  purchaseList: { marginTop: 11, gap: spacing.sm },
  bottomRow: { marginTop: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optionPriceStack: { alignItems: 'flex-end' },
  optionMrp: { color: colors.inkFaint, fontSize: 10, textDecorationLine: 'line-through' },
  optionSale: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  optionSaving: { color: colors.greenDark, fontSize: 10, fontWeight: '800' },
  totalPriceStack: { alignItems: 'flex-end' },
  lineMrp: { color: colors.inkFaint, fontSize: 11, textDecorationLine: 'line-through' },
  linePrice: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  lineSaving: { color: colors.greenDark, fontSize: 11, fontWeight: '900' },
  checkoutAction: { marginTop: spacing.xs },
});
