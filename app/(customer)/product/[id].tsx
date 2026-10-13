import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppBadge, AppCard, Button, EmptyState, ErrorState, LoadingState, OptionCard, QuantityStepper, Screen, SelectField, SelectSheet } from '../../../components/UI';
import { colors, elevation, radius, spacing, typography } from '../../../constants/theme';
import { getCartItemCount } from '../../../services/cart/cartService';
import { getDefaultOneTimeSellingOption, getProducts, type Product, type ProductSellingOption } from '../../../services/products/productService';
import { getActiveSubscriptionPlans, getSubscriptionPlanPriceForSellingOption, type SubscriptionPlan } from '../../../services/subscriptions/subscriptionService';
import { productSubscriptionSectionState, type SubscriptionPlanLoadState } from '../../../services/subscriptions/subscriptionPlanDiscovery';
import { getSubscriptionPlanSellingOption } from '../../../services/subscriptions/subscriptionPlanPrice';
import { resolvePriceDisplay } from '../../../services/products/priceDisplay';
import { getAvailableOneTimeSellingOptions } from '../../../services/products/oneTimeSellingOptions';
import { addToCartAndNavigate, PRODUCT_DETAILS_CART_ROUTE } from '../../../services/cart/productDetailsCartAction';
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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [productLoadError, setProductLoadError] = useState('');
  const [planLoadState, setPlanLoadState] = useState<SubscriptionPlanLoadState>('idle');
  const [planLoadError, setPlanLoadError] = useState('');
  const [productRetry, setProductRetry] = useState(0);
  const [planRetry, setPlanRetry] = useState(0);
  const [planId, setPlanId] = useState('');
  const [selectedSellingOptionId, setSelectedSellingOptionId] = useState('');
  const [packagingOpen, setPackagingOpen] = useState(false);
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [subscriptionStartDate, setSubscriptionStartDate] = useState(nextWeekSaturday());
  const [addingToCart, setAddingToCart] = useState(false);
  const addToCartLock = useRef(false);
  const addToCart = useAppStore((s) => s.addToCart);
  const addSubscriptionToCart = useAppStore((s) => s.addSubscriptionToCart);
  const cart = useAppStore((s) => s.cart);
  const subscriptionCart = useAppStore((s) => s.subscriptionCart);
  const cartCount = useAppStore((s) => getCartItemCount(s.cart, s.subscriptionCart));
  const changeQuantity = useAppStore((s) => s.changeQuantity);
  const changeSubscriptionQuantity = useAppStore((s) => s.changeSubscriptionQuantity);
  const removeFromCart = useAppStore((s) => s.removeFromCart);
  const removeSubscriptionFromCart = useAppStore((s) => s.removeSubscriptionFromCart);
  const setCartPackaging = useAppStore((s) => s.setCartPackaging);
  const setSubscriptionCartPackaging = useAppStore((s) => s.setSubscriptionCartPackaging);

  useFocusEffect(useCallback(() => {
    addToCartLock.current = false;
    setAddingToCart(false);
  }, []));

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setProducts([]);
    setPlans([]);
    setProductLoadError('');
    setPlanLoadState('idle');
    setPlanLoadError('');
    setPlanId('');
    setSelectedSellingOptionId('');
    void (async () => {
      try {
        const result = await getProducts();
        if (!alive) return;
        setProducts(result.products);
      } catch (error) {
        if (alive) setProductLoadError(error instanceof Error ? error.message : 'Unable to load this product.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id, productRetry]);

  const product = useMemo(() => products.find((item) => item.id === id), [products, id]);
  useEffect(() => {
    if (!product) {
      setPlans([]);
      setPlanLoadState('idle');
      setPlanLoadError('');
      return;
    }

    let alive = true;
    setPlans([]);
    setPlanLoadError('');
    setPlanLoadState('loading');
    void getActiveSubscriptionPlans(product.id).then((activePlans) => {
      if (!alive) return;
      setPlans(activePlans);
      setPlanLoadState('ready');
    }).catch((error: unknown) => {
      if (!alive) return;
      setPlans([]);
      setPlanLoadError(error instanceof Error ? error.message : 'Unable to load subscription options.');
      setPlanLoadState('error');
    });
    return () => { alive = false; };
  }, [product?.id, planRetry]);

  const packagingOptions = product ? getAvailableOneTimeSellingOptions(product) : [];
  const defaultSellingOption = product ? getDefaultOneTimeSellingOption(product) : undefined;
  const selectedSellingOption: ProductSellingOption | undefined = packagingOptions.find((option) => option.id === selectedSellingOptionId) || defaultSellingOption;
  const planSectionState = productSubscriptionSectionState({
    loadState: planLoadState,
    planCount: plans.length,
  });
  const canSubscribe = planSectionState === 'ready';
  const canBuyOneTime = Boolean(selectedSellingOption);
  const nextSaturday = nextWeekSaturday();
  const oneTimeCartItem = product ? cart.find((item) => item.id === product.id) : undefined;
  const selectedSubscriptionCartItem = product && planId
    ? subscriptionCart.find((item) => item.id === product.id && item.planId === planId && item.startDate === subscriptionStartDate)
    : undefined;
  const quantity = planId ? (selectedSubscriptionCartItem?.quantity ?? 0) : (oneTimeCartItem?.quantity ?? 0);
  const selectedPlan = planId ? plans.find((plan) => plan.id === planId) : undefined;
  const selectedSubscriptionPrice = selectedPlan
    ? getSubscriptionPlanPriceForSellingOption(selectedPlan, selectedSellingOption?.id, selectedSellingOption?.weightGrams)
    : undefined;
  const selectedSubscriptionOption = selectedPlan
    ? getSubscriptionPlanSellingOption(selectedPlan, selectedSellingOption?.id, selectedSellingOption?.weightGrams)
    : undefined;
  const selectedPlanHasPrice = selectedPlan !== undefined && selectedSubscriptionPrice !== undefined;
  const addToCartPrice = planId ? selectedSubscriptionPrice : selectedSellingOption?.price;

  if (loading) return <Screen><LoadingState label="Loading product…" /></Screen>;
  if (productLoadError) return <Screen><ErrorState title="Product unavailable" message={productLoadError} onRetry={() => setProductRetry((attempt) => attempt + 1)} /></Screen>;
  if (!product) return <Screen><EmptyState title="Product not found." /></Screen>;

  const imageSource = product.imageUrl?.startsWith('http') ? { uri: product.imageUrl } : require('../../../assets/products/placeholder.png');
  const shortDescription = richTextToNativeText(product.shortDescription);
  const description = richTextToNativeText(product.description) || 'Freshly grown microgreens, harvested with care and prepared for delivery.';

  const formatOptionWeight = (grams: number) => grams >= 1000 && grams % 1000 === 0 ? `${grams / 1000}kg` : `${grams}g`;

  const add = () => {
    if (!canBuyOneTime || !selectedSellingOption) throw new Error('Choose an available package before adding this product to your cart.');
    addToCart(product, formatOptionWeight(selectedSellingOption.weightGrams));
  };

  const subscribe = () => {
    if (!canSubscribe || !selectedPlan || !selectedSellingOption || selectedSubscriptionPrice === undefined || !subscriptionStartDate) {
      throw new Error('Choose an available subscription option and start date before adding it to your cart.');
    }
    addSubscriptionToCart(product, {
      id: selectedPlan.id,
      name: selectedPlan.name,
      frequency: selectedPlan.frequency,
      deliveriesPerTerm: selectedPlan.deliveriesPerTerm,
      price: selectedSubscriptionPrice,
      maximumPlanPrice: selectedSubscriptionOption?.maximumPlanPrice,
      sellingOptionId: selectedSellingOption.id,
      sellingOptionLabel: formatOptionWeight(selectedSellingOption.weightGrams),
      weightGrams: selectedSellingOption.weightGrams,
    }, subscriptionStartDate, 1);
  };

  const selectPlan = (nextPlanId: string) => {
    setPlanId(nextPlanId);
  };

  const addSelectedPurchaseToCart = async () => {
    setAddingToCart(true);
    try {
      await addToCartAndNavigate(
        addToCartLock,
        () => { if (planId) subscribe(); else add(); },
        () => router.push(PRODUCT_DETAILS_CART_ROUTE),
      );
    } catch (error) {
      setAddingToCart(false);
      const message = error instanceof Error ? error.message : 'Please check your cart and try again.';
      Alert.alert('Unable to add to cart', message, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Try again', onPress: () => { void addSelectedPurchaseToCart(); } },
      ]);
    }
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

  const selectPackaging = (option: ProductSellingOption) => {
    setSelectedSellingOptionId(option.id);
    if (oneTimeCartItem && !planId) {
      setCartPackaging(product.id, option.weightGrams, option.price, option.mrp, option.id, formatOptionWeight(option.weightGrams));
    }
    if (selectedSubscriptionCartItem && planId) {
      const activePlan = plans.find((item) => item.id === planId);
      const planOption = activePlan
        ? getSubscriptionPlanSellingOption(activePlan, option.id, option.weightGrams)
        : undefined;
      if (activePlan && planOption) {
        setSubscriptionCartPackaging(product.id, planId, subscriptionStartDate, option.weightGrams, Number(planOption.planPrice), String(planOption.sellingOptionId ?? planOption.id ?? option.id), formatOptionWeight(option.weightGrams), planOption.maximumPlanPrice);
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
    <View style={styles.screenRoot}>
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
              {hasOneTimeDiscount && selectedSellingOption ? <Text style={styles.purchaseMrp}>MRP {money(selectedSellingOption.mrp, product.currency)}</Text> : null}
              <Text style={styles.purchasePrice}>{money(selectedSellingOption?.price ?? 0, product.currency)}</Text>
              {hasOneTimeDiscount && selectedSellingOption ? <Text style={styles.purchaseSavings}>Save {money(selectedSellingOption.mrp - selectedSellingOption.price, product.currency)}</Text> : null}
            </View>}
          /> : null}

          {canSubscribe ? plans.map((plan) => {
            const subscriptionPrice = getSubscriptionPlanPriceForSellingOption(plan, selectedSellingOption?.id, selectedSellingOption?.weightGrams);
            const subscriptionPriceDisplay = subscriptionPrice === undefined
              ? { originalPrice: undefined, savings: undefined }
              : resolvePriceDisplay(subscriptionPrice, getSubscriptionPlanSellingOption(plan, selectedSellingOption?.id, selectedSellingOption?.weightGrams)?.maximumPlanPrice);
            return <OptionCard
              key={plan.id}
              title={plan.name}
              subtitle={Number(plan.deliveriesPerTerm ?? 0) > 0 ? `${Number(plan.deliveriesPerTerm)} deliveries / term` : 'Automatic deliveries'}
              selected={planId === plan.id}
              onPress={() => selectPlan(plan.id)}
              disabled={subscriptionPrice === undefined}
              trailing={<View style={styles.purchasePriceBlock}>
                {subscriptionPriceDisplay.originalPrice !== undefined ? <Text style={styles.purchaseMrp}>Original {money(subscriptionPriceDisplay.originalPrice, product.currency)}</Text> : null}
                {subscriptionPrice !== undefined ? <Text style={styles.purchasePrice}>{money(subscriptionPrice, product.currency)}</Text> : <Text style={styles.purchasePriceUnavailable}>Price unavailable</Text>}
                {subscriptionPriceDisplay.savings !== undefined ? <Text style={styles.purchaseSavings}>Save {money(subscriptionPriceDisplay.savings, product.currency)}</Text> : null}
              </View>}
            />;
          }) : null}
        </View>

        {planSectionState === 'loading' ? <Text style={styles.subscriptionState}>Loading subscription options…</Text> : null}
        {planSectionState === 'empty' ? <Text style={styles.subscriptionState}>No active subscription options are available for this product.</Text> : null}
        {planSectionState === 'error' ? (
          <View style={styles.subscriptionError}>
            <Text style={styles.subscriptionState}>{planLoadError || 'Unable to load subscription options.'}</Text>
            <Button title="Retry subscription options" secondary onPress={() => setPlanRetry((attempt) => attempt + 1)} />
          </View>
        ) : null}

        {canSubscribe && planId ? (
          <View style={styles.startDateSection}>
            <SelectField label="Start date" value={subscriptionStartDate} onPress={() => setStartDateOpen(true)} accessibilityLabel="Choose subscription start date" />
            <Text style={styles.startDateHint}>Choose a Saturday for your first delivery.</Text>
          </View>
        ) : null}

        {quantity > 0 ? (
          <View style={styles.cartActionRow}>
            <QuantityStepper quantity={quantity} onDecrease={decrease} onIncrease={increase} itemLabel={product.name} />
            <Text style={styles.selectedTotal}>{money((planId ? (selectedSubscriptionPrice ?? 0) : (selectedSellingOption?.price ?? 0)) * quantity, product.currency)}{planId ? ' / term' : ''}</Text>
          </View>
        ) : null}
        <View style={styles.addAction}>
          <Button
            title={addingToCart ? 'Adding to Cart…' : addToCartPrice === undefined ? 'Add to Cart' : `Add to Cart — ${money(addToCartPrice, product.currency)}`}
            onPress={() => { void addSelectedPurchaseToCart(); }}
            disabled={planId ? (!canSubscribe || !selectedPlanHasPrice) : (!canBuyOneTime || !selectedSellingOption)}
            loading={addingToCart}
          />
        </View>
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
      <View style={styles.floatingCartClearance} />
    </Screen>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={cartCount > 0 ? `Cart, ${cartCount} ${cartCount === 1 ? 'item' : 'items'}` : 'Cart, empty'}
      testID="product-details-floating-cart"
      onPress={() => router.push(PRODUCT_DETAILS_CART_ROUTE)}
      style={({ pressed }) => [
        styles.floatingCart,
        { bottom: Math.max(insets.bottom, spacing.sm) + spacing.md },
        pressed && styles.floatingCartPressed,
      ]}
    >
      <MaterialCommunityIcons name="cart-outline" size={26} color={colors.white} />
      <AppBadge style={styles.cartBadge}>
        {cartCount > 99 ? '99+' : cartCount}
      </AppBadge>
    </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1 },
  floatingCartClearance: { height: 72 },
  floatingCart: { position: 'absolute', right: spacing.lg, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greenDark, ...elevation.md },
  floatingCartPressed: { opacity: 0.82 },
  cartBadge: { position: 'absolute', top: -3, right: -4, borderWidth: 2, borderColor: colors.panel },
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
  purchaseSavings: { color: colors.greenDark, fontSize: 10, fontWeight: '800', marginTop: 2 },
  purchasePriceUnavailable: { color: colors.inkFaint, fontSize: 10, fontWeight: '700' },
  subscriptionState: { color: colors.inkSoft, fontSize: 12, lineHeight: 18, marginTop: spacing.sm },
  subscriptionError: { gap: spacing.sm, marginTop: spacing.sm },
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
