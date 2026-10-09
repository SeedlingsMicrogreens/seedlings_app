import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { AppCard, Button, EmptyState, LoadingState, OptionCard, QuantityStepper, Screen, SelectField, SelectSheet } from '../../../components/UI';
import { colors, radius, spacing, typography } from '../../../constants/theme';
import { getDefaultOneTimeSellingOption, getProducts, type Product, type ProductSellingOption } from '../../../services/products/productService';
import { isProductSubscriptionEligible } from '../../../services/products/subscriptionEligibility';
import { getActiveSubscriptionPlans, getSubscriptionPlanPriceForSellingOption, type SubscriptionPlan } from '../../../services/subscriptions/subscriptionService';
import { useAppStore } from '../../../store/appStore';

const money = (value: number, currency = 'INR') => {
  try { return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value); }
  catch { return `₹${value}`; }
};

function nextWeekSaturday() {
  const date = new Date();
  const day = date.getDay();
  const days = day === 6 ? 7 : (6 - day + 7) % 7;
  date.setDate(date.getDate() + (days || 7));
  return date.toISOString().slice(0, 10);
}

/** The website stores descriptions as HTML rich text. Keep the same content on native UI without adding a web page. */
function richTextToNativeText(value?: string) {
  if (!value?.trim()) return '';
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [planId, setPlanId] = useState('');
  const [selectedSellingOptionId, setSelectedSellingOptionId] = useState('');
  const [packagingOpen, setPackagingOpen] = useState(false);
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [subscriptionStartDate, setSubscriptionStartDate] = useState(nextWeekSaturday());
  const addToCart = useAppStore((s) => s.addToCart);
  const addSubscriptionToCart = useAppStore((s) => s.addSubscriptionToCart);
  const cart = useAppStore((s) => s.cart);
  const subscriptionCart = useAppStore((s) => s.subscriptionCart);
  const changeQuantity = useAppStore((s) => s.changeQuantity);
  const changeSubscriptionQuantity = useAppStore((s) => s.changeSubscriptionQuantity);
  const removeFromCart = useAppStore((s) => s.removeFromCart);
  const removeSubscriptionFromCart = useAppStore((s) => s.removeSubscriptionFromCart);
  const setCartPackaging = useAppStore((s) => s.setCartPackaging);
  const setSubscriptionCartPackaging = useAppStore((s) => s.setSubscriptionCartPackaging);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const result = await getProducts();
        if (!alive) return;
        setProducts(result.products);
        const product = result.products.find((item) => item.id === id);
        if (product?.active) {
          try {
            const activePlans = await getActiveSubscriptionPlans(product.id);
            if (!alive) return;
            setPlans(activePlans.filter((plan) => plan.active === true && Number(plan.price ?? 0) >= 0));
          } catch {
            if (alive) setPlans([]);
          }
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  const product = useMemo(() => products.find((item) => item.id === id), [products, id]);
  const defaultSellingOption = product ? getDefaultOneTimeSellingOption(product) : undefined;
  const selectedSellingOption: ProductSellingOption | undefined = product?.sellingOptions?.find((option) => option.id === selectedSellingOptionId && option.active !== false) || defaultSellingOption;
  const canSubscribe = Boolean(product && isProductSubscriptionEligible(product) && plans.length > 0);
  const canBuyOneTime = Boolean(product?.oneTimePurchase && selectedSellingOption);
  const nextSaturday = nextWeekSaturday();
  const oneTimeCartItem = product ? cart.find((item) => item.id === product.id) : undefined;
  const selectedSubscriptionCartItem = product && planId
    ? subscriptionCart.find((item) => item.id === product.id && item.planId === planId && item.startDate === subscriptionStartDate)
    : undefined;
  const quantity = planId ? (selectedSubscriptionCartItem?.quantity ?? 0) : (oneTimeCartItem?.quantity ?? 0);
  const selectedPlan = planId ? plans.find((plan) => plan.id === planId) : undefined;
  const selectedSubscriptionPrice = selectedPlan ? getSubscriptionPlanPriceForSellingOption(selectedPlan, selectedSellingOption?.id) : 0;

  useEffect(() => {
    if (product && !product.oneTimePurchase && plans.length > 0 && !planId) {
      setPlanId(plans[0].id);
    }
  }, [product, plans, planId]);

  if (loading) return <Screen><LoadingState label="Loading product…" /></Screen>;
  if (!product) return <Screen><EmptyState title="Product not found." /></Screen>;

  const imageSource = product.imageUrl?.startsWith('http') ? { uri: product.imageUrl } : require('../../../assets/products/placeholder.png');
  const shortDescription = richTextToNativeText(product.shortDescription);
  const description = richTextToNativeText(product.description) || 'Freshly grown microgreens, harvested with care and prepared for delivery.';

  const formatOptionWeight = (grams: number) => grams >= 1000 && grams % 1000 === 0 ? `${grams / 1000}kg` : `${grams}g`;

  const add = () => {
    if (!canBuyOneTime || !selectedSellingOption) return;
    addToCart(product, formatOptionWeight(selectedSellingOption.weightGrams));
  };

  const subscribe = () => {
    if (!canSubscribe || !selectedPlan || !selectedSellingOption || !subscriptionStartDate) return;
    addSubscriptionToCart(product, {
      id: selectedPlan.id,
      name: selectedPlan.name,
      frequency: selectedPlan.frequency,
      deliveriesPerTerm: selectedPlan.deliveriesPerTerm,
      price: selectedSubscriptionPrice,
      sellingOptionId: selectedSellingOption.id,
      sellingOptionLabel: formatOptionWeight(selectedSellingOption.weightGrams),
      weightGrams: selectedSellingOption.weightGrams,
    }, subscriptionStartDate, 1);
  };

  const selectPlan = (nextPlanId: string) => {
    setPlanId(nextPlanId);
  };

  const decrease = () => {
    if (quantity <= 0) return;
    if (planId) {
      if (quantity === 1) removeSubscriptionFromCart(product.id, planId, subscriptionStartDate);
      else changeSubscriptionQuantity(product.id, planId, subscriptionStartDate, -1);
    } else {
      if (quantity === 1) removeFromCart(product.id);
      else changeQuantity(product.id, -1);
    }
  };

  const increase = () => {
    if (quantity <= 0) {
      if (planId) subscribe(); else add();
      return;
    }
    if (planId) changeSubscriptionQuantity(product.id, planId, subscriptionStartDate, 1);
    else changeQuantity(product.id, 1);
  };

  const packagingOptions = (product.sellingOptions ?? []).filter((option) => option.active !== false && option.weightGrams > 0).sort((a, b) => a.weightGrams - b.weightGrams);
  const selectPackaging = (option: ProductSellingOption) => {
    setSelectedSellingOptionId(option.id);
    if (oneTimeCartItem && !planId) {
      setCartPackaging(product.id, option.weightGrams, option.price, option.mrp, option.id, formatOptionWeight(option.weightGrams));
    }
    if (selectedSubscriptionCartItem && planId) {
      const activePlan = plans.find((item) => item.id === planId);
      const planOption = activePlan?.sellingOptions?.find((item) => String(item.sellingOptionId ?? item.id ?? '') === String(option.id));
      if (planOption) {
        setSubscriptionCartPackaging(product.id, planId, subscriptionStartDate, option.weightGrams, Number(planOption.planPrice ?? activePlan?.price ?? 0), String(planOption.sellingOptionId ?? planOption.id ?? option.id), formatOptionWeight(option.weightGrams));
      }
    }
    setPackagingOpen(false);
  };
  const startDateOptions = Array.from({ length: 8 }, (_, index) => {
    const base = new Date();
    const day = base.getDay();
    const daysUntilSaturday = day === 6 ? 7 : (6 - day + 7) % 7;
    base.setDate(base.getDate() + (daysUntilSaturday || 7) + index * 7);
    return base.toISOString().slice(0, 10);
  });
  const hasOneTimeDiscount = Boolean(selectedSellingOption && selectedSellingOption.mrp > selectedSellingOption.price);

  return (
    <Screen>
      <Image source={imageSource} style={styles.productImage} resizeMode="contain" accessibilityLabel={product.name} />
      <Text style={styles.tag}>{product.type === 'multiple' ? 'Salable combo' : 'Fresh microgreen'}</Text>
      <Text style={styles.title}>{product.name}</Text>
      <Text style={styles.rating}>{product.popular ? 'Featured · Fresh availability' : 'Fresh availability'}</Text>

      {shortDescription ? <Text style={styles.shortDescription}>{shortDescription}</Text> : null}

      <View style={styles.purchaseSection}>
        <SelectField label="Packaging" value={formatOptionWeight(selectedSellingOption?.weightGrams ?? 0)} onPress={() => setPackagingOpen(true)} accessibilityLabel="Choose packaging" />

        <View style={styles.optionList}>
          {canBuyOneTime ? <OptionCard
            title="One-time purchase"
            subtitle="Buy once"
            selected={!planId}
            onPress={() => setPlanId('')}
            trailing={<View style={styles.purchasePriceBlock}>
              <Text style={styles.purchasePrice}>{money(selectedSellingOption?.price ?? 0, product.currency)}</Text>
              {hasOneTimeDiscount && selectedSellingOption ? <Text style={styles.purchaseMrp}>{money(selectedSellingOption.mrp, product.currency)}</Text> : null}
            </View>}
          /> : null}

          {canSubscribe ? plans.map((plan) => <OptionCard
            key={plan.id}
            title={plan.name}
            subtitle={Number(plan.deliveriesPerTerm ?? 0) > 0 ? `${Number(plan.deliveriesPerTerm)} deliveries / term` : 'Automatic deliveries'}
            selected={planId === plan.id}
            onPress={() => selectPlan(plan.id)}
            trailing={money(getSubscriptionPlanPriceForSellingOption(plan, selectedSellingOption?.id), product.currency)}
          />) : null}
        </View>

        {canSubscribe && planId ? (
          <View style={styles.startDateSection}>
            <SelectField label="Start date" value={subscriptionStartDate} onPress={() => setStartDateOpen(true)} accessibilityLabel="Choose subscription start date" />
            <Text style={styles.startDateHint}>Choose a Saturday for your first delivery.</Text>
          </View>
        ) : null}

        {quantity > 0 ? (
          <View style={styles.cartActionRow}>
            <QuantityStepper quantity={quantity} onDecrease={decrease} onIncrease={increase} itemLabel={product.name} />
            <Text style={styles.selectedTotal}>{money((planId ? selectedSubscriptionPrice : (selectedSellingOption?.price ?? 0)) * quantity, product.currency)}{planId ? ' / term' : ''}</Text>
          </View>
        ) : (
          <View style={styles.addAction}>
            <Button
              title={planId ? `Add to Cart — ${money(selectedSubscriptionPrice, product.currency)}` : canBuyOneTime && selectedSellingOption ? `Add to Cart — ${money(selectedSellingOption.price, product.currency)}` : 'Purchase unavailable'}
              onPress={planId ? subscribe : add}
              disabled={planId ? !canSubscribe : (!canBuyOneTime || !selectedSellingOption)}
            />
          </View>
        )}
      </View>

      <SelectSheet
        visible={startDateOpen}
        onClose={() => setStartDateOpen(false)}
        title="Subscription start date"
        options={startDateOptions.map((date) => ({ key: date, label: date, selected: subscriptionStartDate === date }))}
        onSelect={(date) => { setSubscriptionStartDate(date); setStartDateOpen(false); }}
      />

      <SelectSheet
        visible={packagingOpen}
        onClose={() => setPackagingOpen(false)}
        title="Packaging"
        options={packagingOptions.map((option) => ({ key: option.id, label: formatOptionWeight(option.weightGrams), detail: money(option.price, product.currency), selected: selectedSellingOption?.id === option.id }))}
        onSelect={(id) => { const option = packagingOptions.find((item) => item.id === id); if (option) selectPackaging(option); }}
      />

      <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>Availability</Text>
        <Text style={styles.muted}>Availability is confirmed when you place the order.</Text>
        <Text style={[styles.infoLabel, styles.infoLabelSpaced]}>Purchase</Text>
        <Text style={styles.muted}>{canBuyOneTime ? 'One-time purchase available.' : 'Purchase unavailable.'}</Text>
        <Text style={[styles.infoLabel, styles.infoLabelSpaced]}>Delivery</Text>
        <Text style={styles.muted}>Weekend delivery slots.</Text>
      </View>

      <AppCard style={styles.descriptionCard}>
        <Text style={styles.sectionTitle}>Product description</Text>
        <Text style={styles.description}>{description}</Text>
      </AppCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  productImage: { width: '100%', height: 250, backgroundColor: colors.block, borderRadius: radius.xl },
  tag: { color: colors.greenDark, fontSize: typography.caption, fontWeight: '900', marginTop: spacing.lg, textTransform: 'uppercase' },
  title: { fontSize: 25, lineHeight: 30, fontWeight: '900', color: colors.ink, marginTop: 6 },
  rating: { color: colors.inkSoft, fontSize: 12, marginTop: 4 },
  shortDescription: { color: colors.inkSoft, fontSize: 14, lineHeight: 21, marginTop: spacing.md },
  purchaseSection: { marginTop: 18 },
  optionList: { marginTop: spacing.md, gap: spacing.sm },
  purchasePriceBlock: { alignItems: 'flex-end' },
  purchasePrice: { color: colors.greenDark, fontSize: 14, fontWeight: '900' },
  purchaseMrp: { color: colors.inkFaint, textDecorationLine: 'line-through', fontSize: 10, marginTop: 2 },
  startDateSection: { marginTop: spacing.md },
  startDateHint: { color: colors.inkSoft, fontSize: 12, marginTop: 5 },
  cartActionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  selectedTotal: { color: colors.greenDark, fontSize: 16, fontWeight: '900' },
  addAction: { marginTop: spacing.md },
  infoCard: { backgroundColor: colors.greenTint, borderRadius: radius.xl, padding: 14, marginTop: 18 },
  infoLabel: { color: colors.ink, fontWeight: '900' },
  infoLabelSpaced: { marginTop: spacing.md },
  muted: { color: colors.inkSoft, marginTop: 3, lineHeight: 19 },
  descriptionCard: { marginTop: spacing.lg, marginBottom: 0 },
  sectionTitle: { fontSize: 17, fontWeight: '900', color: colors.ink },
  description: { color: colors.inkSoft, lineHeight: 21, marginTop: 7 },
});
