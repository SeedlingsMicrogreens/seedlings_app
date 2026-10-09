import React from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput, TextStyle, View, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSegments } from 'expo-router';
import { colors, elevation, layout, radius, spacing, typography } from '../constants/theme';
import type { Product } from '../services/products/productService';
import { getDefaultOneTimeSellingOption } from '../services/products/productService';
import { useAppStore } from '../store/appStore';

// Shared screen shell. Tab scenes already end above the bottom tab bar (measured on device), so tab screens only
// add the standard gap; stack screens also reserve the system navigation-bar inset (Android draws edge-to-edge).
export function Screen({ children, scroll = true, refreshControl }: { children: React.ReactNode; scroll?: boolean; refreshControl?: React.ComponentProps<typeof ScrollView>['refreshControl'] }) {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const authenticated = useAppStore((state) => state.authenticated);
  const hasBottomTabs = segments.includes('(tabs)');
  const topInset = !authenticated ? { paddingTop: insets.top + spacing.sm } : null;
  const bottomInset = { paddingBottom: hasBottomTabs ? layout.screenBottomGap : insets.bottom + layout.screenBottomGap };
  // Android draws edge-to-edge (the window is not resized for the IME), so keyboard padding applies on both platforms.
  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      {scroll
        ? <ScrollView style={styles.root} contentContainerStyle={[styles.scrollContent, bottomInset]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} refreshControl={refreshControl}><View style={[styles.screen, topInset]}>{children}</View></ScrollView>
        : <View style={[styles.screen, styles.fill, topInset, bottomInset]}>{children}</View>}
    </KeyboardAvoidingView>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return <View style={styles.pageTitleWrap}>
    <AppText variant="h1" style={styles.pageTitle}>{title}</AppText>
    {subtitle ? <AppText variant="bodySmall" style={styles.pageSubtitle}>{subtitle}</AppText> : null}
  </View>;
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return <View style={styles.sectionHeader}>
    <AppText variant="h2" style={styles.sectionTitle}>{title}</AppText>
    {action && onAction ? <Pressable onPress={onAction} hitSlop={8}><AppText variant="bodySmall" style={styles.sectionAction}>{action}</AppText></Pressable> : null}
  </View>;
}

export function Logo({ size = 110 }: { size?: number }) {
  return <Image source={require('../assets/logo.png')} style={{ width: size, height: size * 0.803 }} resizeMode="contain" />;
}

export function AppText({
  children,
  variant = 'body',
  style,
  numberOfLines,
  maxFontSizeMultiplier,
}: {
  children: React.ReactNode;
  variant?: keyof typeof textVariants;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  maxFontSizeMultiplier?: number;
}) {
  return <Text numberOfLines={numberOfLines} maxFontSizeMultiplier={maxFontSizeMultiplier} style={[styles.textBase, textVariants[variant], style]}>{children}</Text>;
}

/** Pressed state for Pressables. Geometry must stay in static styles; only feedback depends on this. */
export function usePressedState() {
  const [pressed, setPressed] = React.useState(false);
  return { pressed, pressHandlers: { onPressIn: () => setPressed(true), onPressOut: () => setPressed(false) } };
}

// Standard button: the outer View owns the visual surface (background, border, radius, 50dp height and the
// caller's layout style); the inner Pressable fills it and owns interaction, ripple and accessibility.
export function Button({ title, onPress, secondary = false, orange = false, danger = false, disabled = false, loading = false, style, accessibilityLabel }: { title: string; onPress: () => void; secondary?: boolean; orange?: boolean; danger?: boolean; disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string }) {
  const unavailable = disabled || loading;
  const { pressed, pressHandlers } = usePressedState();
  const outlined = secondary || danger;
  return (
    <View style={[styles.button, secondary && styles.secondaryButton, orange && styles.orangeButton, danger && styles.dangerButton, unavailable && styles.disabledButton, pressed && !unavailable && styles.pressed, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityState={{ disabled: unavailable, busy: loading }}
        disabled={unavailable}
        onPress={onPress}
        {...pressHandlers}
        android_ripple={unavailable ? undefined : { color: outlined ? colors.rippleDark : colors.rippleLight }}
        style={styles.buttonPressable}
      >
        {loading ? <ActivityIndicator size="small" color={danger ? colors.danger : secondary ? colors.greenDark : colors.white} /> : <Text numberOfLines={1} maxFontSizeMultiplier={typography.controlMaxFontScale} style={[styles.buttonText, secondary && styles.secondaryButtonText, danger && styles.dangerButtonText, unavailable && styles.disabledButtonText]}>{title}</Text>}
      </Pressable>
    </View>
  );
}

export function ProfileAvatar({ uri, name, size = 96 }: { uri?: string; name?: string; size?: number }) {
  const [imageFailed, setImageFailed] = React.useState(false);
  React.useEffect(() => setImageFailed(false), [uri]);
  const initial = name?.trim().charAt(0).toUpperCase() || 'S';
  const avatarStyle = { width: size, height: size, borderRadius: size / 2 } as const;
  if (uri && !imageFailed) {
    return <Image source={{ uri }} style={[styles.profileAvatar, avatarStyle]} resizeMode="cover" onError={() => setImageFailed(true)} />;
  }
  return <View style={[styles.profileAvatar, avatarStyle]}><Text style={[styles.profileAvatarText, { fontSize: Math.max(24, size * 0.34) }]}>{initial}</Text></View>;
}

export function AccountMenuSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.accountSection}>
    <AppText variant="h3" style={styles.accountSectionTitle}>{title}</AppText>
    <View style={styles.accountMenu}>{children}</View>
  </View>;
}

export function AccountMenuItem({ label, icon, onPress, destructive = false, last = false }: { label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; onPress: () => void; destructive?: boolean; last?: boolean }) {
  const { pressed, pressHandlers } = usePressedState();
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    onPress={onPress}
    {...pressHandlers}
    style={[styles.accountMenuItem, !last && styles.accountMenuItemDivider, pressed && styles.accountMenuItemPressed]}
  >
    <View style={styles.accountMenuLeft}>
      <View style={[styles.accountMenuIcon, destructive && styles.accountMenuIconDanger]}>
        <MaterialCommunityIcons name={icon} size={20} color={destructive ? colors.danger : colors.greenDark} />
      </View>
      <AppText variant="body" style={[styles.accountMenuLabel, destructive && styles.accountMenuLabelDanger]}>{label}</AppText>
    </View>
    <View pointerEvents="none" style={styles.accountMenuChevronWrap}>
      <MaterialCommunityIcons name="chevron-right" size={22} color={colors.inkFaint} />
    </View>
  </Pressable>;
}

export function AppInput({ value, onChangeText, placeholder, keyboardType, maxLength, secureTextEntry, editable = true, multiline = false, accessibilityLabel, style }: {
  value: string;
  onChangeText?: (value: string) => void;
  placeholder?: string;
  keyboardType?: React.ComponentProps<typeof TextInput>['keyboardType'];
  maxLength?: number;
  secureTextEntry?: boolean;
  editable?: boolean;
  multiline?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<TextStyle>;
}) {
  return <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.inkFaint} keyboardType={keyboardType} maxLength={maxLength} secureTextEntry={secureTextEntry} editable={editable} multiline={multiline} textAlignVertical={multiline ? 'top' : 'center'} accessibilityLabel={accessibilityLabel ?? placeholder} style={[styles.input, multiline && styles.inputMultiline, !editable && styles.inputDisabled, style]} />;
}

export function AppCard({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function AppIconButton({ children, onPress, accessibilityLabel, style }: { children: React.ReactNode; onPress: () => void; accessibilityLabel: string; style?: StyleProp<ViewStyle> }) {
  const { pressed, pressHandlers } = usePressedState();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} hitSlop={6} {...pressHandlers} style={[styles.iconButton, pressed && styles.pressedSoft, style]}>{children}</Pressable>;
}

export function AppBadge({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.badge, style]}><Text style={styles.badgeText}>{children}</Text></View>;
}


export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <AppCard style={style}>{children}</AppCard>;
}

export function ProductCard({ product, onPress }: { product: Product; onPress: () => void }) {
  const addToCart = useAppStore((s) => s.addToCart);
  const changeQuantity = useAppStore((s) => s.changeQuantity);
  const removeFromCart = useAppStore((s) => s.removeFromCart);
  const quantity = useAppStore((s) => s.cart.find((item) => item.id === product.id)?.quantity ?? 0);
  const source = product.imageUrl?.startsWith('http') ? { uri: product.imageUrl } : require('../assets/products/placeholder.png');
  const defaultOption = getDefaultOneTimeSellingOption(product);
  const displayPrice = defaultOption?.price ?? product.price;
  const displayMrp = defaultOption?.mrp ?? product.mrp;
  const displayWeight = defaultOption?.weightGrams ? (defaultOption.weightGrams >= 1000 && defaultOption.weightGrams % 1000 === 0 ? `${defaultOption.weightGrams / 1000}kg` : `${defaultOption.weightGrams}g`) : product.defaultWeight;
  const hasDiscount = Boolean(displayMrp && displayMrp > displayPrice);

  const add = () => {
    addToCart(product, displayWeight);
  };

  const decrease = () => {
    if (quantity <= 1) removeFromCart(product.id);
    else changeQuantity(product.id, -1);
  };

  const increase = () => changeQuantity(product.id, 1);
  const { pressed, pressHandlers } = usePressedState();

  return (
    <View style={styles.productCard}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${product.name}`} onPress={onPress} {...pressHandlers} style={pressed ? styles.pressedSoft : undefined}>
        <View style={styles.productImageWrap}><Image source={source} style={styles.productImage} resizeMode="contain" /></View>
        <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
        {displayWeight ? <Text style={styles.productMeta}>{displayWeight}</Text> : null}
      </Pressable>
      <View style={styles.priceRow}>
        <View style={styles.priceGroup}>
          <Text style={styles.price}>₹{displayPrice}</Text>
          {hasDiscount ? <Text style={styles.mrp}>₹{displayMrp}</Text> : null}
        </View>
        {product.oneTimePurchase ? (quantity === 0 ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Add ${product.name} to cart`} onPress={add} style={styles.addButton}>
            <MaterialCommunityIcons name="plus" size={24} color={colors.white} />
          </Pressable>
        ) : (
          <QuantityStepper compact quantity={quantity} onDecrease={decrease} onIncrease={increase} itemLabel={product.name} />
        )) : null}
      </View>
      {hasDiscount ? <Text style={styles.saving}>Save ₹{Math.max(0, Number(displayMrp) - displayPrice)}</Text> : null}
    </View>
  );
}

export function SearchBar({ value, onChangeText }: { value: string; onChangeText: (v: string) => void }) {
  return <View style={styles.searchWrap}>
    <MaterialCommunityIcons name="magnify" size={20} color={colors.greenDark} />
    <AppInput value={value} onChangeText={onChangeText} placeholder="Search microgreens, recipes…" accessibilityLabel="Search products" style={styles.search} />
    {value ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => onChangeText('')} hitSlop={12} style={styles.clearSearch}><MaterialCommunityIcons name="close-circle" size={18} color={colors.inkFaint} /></Pressable> : null}
  </View>;
}

export function Chip({ label, selected, accent = 'green', onPress }: { label: string; selected?: boolean; accent?: 'green' | 'orange'; onPress: () => void }) {
  const orange = accent === 'orange';
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: Boolean(selected) }} hitSlop={4} onPress={onPress} style={[styles.chip, selected && (orange ? styles.chipSelectedOrange : styles.chipSelectedGreen)]}>
    <AppText variant="caption" maxFontSizeMultiplier={typography.controlMaxFontScale} style={[styles.chipText, selected && (orange ? styles.chipTextSelectedOrange : styles.chipTextSelectedGreen)]}>{label}</AppText>
  </Pressable>;
}

export function EmptyState({ title, message, action, onAction }: { title: string; message?: string; action?: string; onAction?: () => void }) {
  return <Card style={styles.emptyState}>
    <View style={styles.emptyIcon}><MaterialCommunityIcons name="sprout-outline" size={28} color={colors.greenDark} /></View>
    <Text style={styles.emptyTitle}>{title}</Text>
    {message ? <Text style={styles.emptyMessage}>{message}</Text> : null}
    {action && onAction ? <View style={styles.emptyAction}><Button title={action} onPress={onAction} /></View> : null}
  </Card>;
}

export function LoadingState({ label }: { label?: string }) {
  return <View style={styles.stateCenter} accessibilityRole="progressbar" accessibilityLabel={label ?? 'Loading'}>
    <ActivityIndicator size="large" color={colors.greenDark} />
    {label ? <AppText variant="bodySmall" style={styles.stateLabel}>{label}</AppText> : null}
  </View>;
}

export function ErrorState({ title, message, onRetry, retryLabel = 'Try again' }: { title?: string; message: string; onRetry?: () => void; retryLabel?: string }) {
  return <AppCard>
    {title ? <AppText variant="h3">{title}</AppText> : null}
    <AppText variant="body" style={[styles.errorText, title ? styles.errorTextSpaced : null]}>{message}</AppText>
    {onRetry ? <View style={styles.errorAction}><Button title={retryLabel} onPress={onRetry} /></View> : null}
  </AppCard>;
}

/** Inline text action (links such as "Change", "Edit", "Try again"). Always provides a ≥44dp touch target. */
export function TextAction({ label, onPress, tone = 'primary', bordered = false, icon, disabled = false, accessibilityLabel, style }: { label: string; onPress: () => void; tone?: 'primary' | 'muted' | 'danger'; bordered?: boolean; icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name']; disabled?: boolean; accessibilityLabel?: string; style?: StyleProp<ViewStyle> }) {
  const color = disabled ? colors.inkFaint : tone === 'danger' ? colors.danger : tone === 'muted' ? colors.inkSoft : colors.greenDark;
  const { pressed, pressHandlers } = usePressedState();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} hitSlop={bordered ? 0 : 8} {...pressHandlers} style={[styles.textAction, bordered && styles.textActionBordered, pressed && styles.pressedSoft, style]}>
    <Text maxFontSizeMultiplier={typography.controlMaxFontScale} style={[styles.textActionText, { color }]}>{label}</Text>
    {icon ? <MaterialCommunityIcons name={icon} size={16} color={color} /> : null}
  </Pressable>;
}

/** Packaging / plan style selectable card with a radio indicator. */
export function OptionCard({ title, subtitle, trailing, selected, disabled = false, onPress }: { title: string; subtitle?: string; trailing?: React.ReactNode; selected: boolean; disabled?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityLabel={title} accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress} style={[styles.optionCard, selected && styles.optionCardSelected, disabled && styles.optionCardDisabled]}>
    <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
    <View style={styles.optionCopy}>
      <Text style={styles.optionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.optionSub}>{subtitle}</Text> : null}
    </View>
    {typeof trailing === 'string' ? <Text style={styles.optionPrice}>{trailing}</Text> : trailing ?? null}
  </Pressable>;
}

/** Read-only field that opens a picker (e.g. packaging, start date). */
export function SelectField({ label, value, onPress, accessibilityLabel }: { label?: string; value: string; onPress: () => void; accessibilityLabel?: string }) {
  return <View>
    {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? `${label ?? 'Select'}: ${value}`} onPress={onPress} style={styles.selectField}>
      <Text style={styles.selectText} maxFontSizeMultiplier={typography.controlMaxFontScale}>{value}</Text>
      <MaterialCommunityIcons name="chevron-down" size={20} color={colors.inkSoft} />
    </Pressable>
  </View>;
}

/** Quantity control. Shows a remove (trash) action at quantity 1. `compact` is used inside product cards. */
export function QuantityStepper({ quantity, onDecrease, onIncrease, itemLabel, compact = false }: { quantity: number; onDecrease: () => void; onIncrease: () => void; itemLabel: string; compact?: boolean }) {
  const removing = quantity <= 1;
  const iconSize = compact ? 17 : 18;
  const slop = compact ? { top: 5, bottom: 5, left: 3, right: 3 } : undefined;
  return <View style={[styles.stepper, compact && styles.stepperCompact]}>
    <Pressable accessibilityRole="button" accessibilityLabel={removing ? `Remove ${itemLabel} from cart` : `Decrease ${itemLabel} quantity`} onPress={onDecrease} hitSlop={slop} style={[styles.stepperButton, compact && styles.stepperButtonCompact]}>
      <MaterialCommunityIcons name={removing ? 'trash-can-outline' : 'minus'} size={iconSize} color={colors.greenDark} />
    </Pressable>
    <Text accessibilityLabel={`Quantity ${quantity}`} maxFontSizeMultiplier={typography.controlMaxFontScale} style={[styles.stepperValue, compact && styles.stepperValueCompact]}>{quantity}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${itemLabel} quantity`} onPress={onIncrease} hitSlop={slop} style={[styles.stepperButton, compact && styles.stepperButtonCompact]}>
      <MaterialCommunityIcons name="plus" size={iconSize} color={colors.greenDark} />
    </Pressable>
  </View>;
}

/** Modal sheet anchored to the bottom, padded above the system navigation bar. */
export function BottomSheet({ visible, onClose, title, subtitle, children, closeOnBackdrop = true, animation = 'fade' }: { visible: boolean; onClose: () => void; title?: string; subtitle?: string; children: React.ReactNode; closeOnBackdrop?: boolean; animation?: 'fade' | 'slide' }) {
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType={animation} statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
    <View style={styles.sheetBackdrop}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close" disabled={!closeOnBackdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl }]}>
        {title ? <AppText variant="h3" style={styles.sheetTitle}>{title}</AppText> : null}
        {subtitle ? <AppText variant="bodySmall" style={styles.sheetSubtitle}>{subtitle}</AppText> : null}
        <ScrollView bounces={false} showsVerticalScrollIndicator={false}>{children}</ScrollView>
      </View>
    </View>
  </Modal>;
}

/** Single-choice list inside a BottomSheet. */
export function SelectSheet({ visible, onClose, title, options, onSelect }: { visible: boolean; onClose: () => void; title: string; options: { key: string; label: string; detail?: string; selected?: boolean }[]; onSelect: (key: string) => void }) {
  return <BottomSheet visible={visible} onClose={onClose} title={title}>
    {options.map((option) => <Pressable key={option.key} accessibilityRole="button" accessibilityLabel={option.label} accessibilityState={{ selected: Boolean(option.selected) }} onPress={() => onSelect(option.key)} style={[styles.sheetRow, option.selected && styles.sheetRowSelected]}>
      <Text style={styles.sheetRowText}>{option.label}</Text>
      <View style={styles.sheetRowEnd}>
        {option.detail ? <Text style={styles.sheetRowDetail}>{option.detail}</Text> : null}
        {option.selected ? <MaterialCommunityIcons name="check" size={19} color={colors.greenDark} /> : null}
      </View>
    </Pressable>)}
  </BottomSheet>;
}

/** Non-interactive toast pinned below the header (top) or above the bottom navigation (bottom), safe-area aware. */
export function Toast({ message, position, tone = 'brand' }: { message: string; position: 'top' | 'bottom'; tone?: 'brand' | 'neutral' }) {
  const insets = useSafeAreaInsets();
  const placement = position === 'top'
    ? { top: insets.top + layout.headerHeight + spacing.md }
    : { bottom: insets.bottom + layout.tabBarHeight + spacing.sm };
  return <View pointerEvents="none" style={[styles.toastContainer, placement, position === 'bottom' && styles.toastContainerCentered]}>
    <View style={[styles.toast, tone === 'neutral' ? styles.toastNeutral : styles.toastBrand, position === 'bottom' && styles.toastPill]}>
      <Text style={[styles.toastText, position === 'bottom' && styles.toastTextCentered]}>{message}</Text>
    </View>
  </View>;
}

const textVariants = {
  display: { fontSize: typography.display, lineHeight: 32, fontWeight: '900' as const, color: colors.ink },
  h1: { fontSize: typography.h1, lineHeight: 30, fontWeight: '900' as const, color: colors.ink },
  h2: { fontSize: typography.h2, lineHeight: 26, fontWeight: '900' as const, color: colors.ink },
  h3: { fontSize: typography.h3, lineHeight: 22, fontWeight: '900' as const, color: colors.ink },
  body: { fontSize: typography.body, lineHeight: 20, color: colors.ink },
  bodySmall: { fontSize: typography.bodySmall, lineHeight: 18, color: colors.inkSoft },
  caption: { fontSize: typography.caption, lineHeight: 16, color: colors.inkFaint },
  button: { fontSize: typography.button, lineHeight: 20, fontWeight: '900' as const, color: colors.white },
} as const;

export const styles = StyleSheet.create({
  textBase: { fontFamily: typography.fontFamily },
  input: { height: layout.inputHeight, width: '100%', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, color: colors.ink, fontFamily: typography.fontFamily, fontSize: typography.body },
  inputDisabled: { backgroundColor: colors.block, color: colors.inkFaint },
  inputMultiline: { height: undefined, minHeight: 110, paddingTop: spacing.md, paddingBottom: spacing.md },
  iconButton: { minWidth: layout.minTouch, minHeight: layout.minTouch, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  badge: { minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: radius.pill, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: colors.white, fontFamily: typography.fontFamily, fontSize: 10, lineHeight: 13, fontWeight: '900' },
  root: { flex: 1, backgroundColor: colors.paper },
  fill: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  screen: { paddingHorizontal: layout.screenHorizontal, paddingTop: layout.screenTop },
  pageTitleWrap: { marginTop: spacing.sm, marginBottom: spacing.md },
  pageTitle: { fontFamily: typography.fontFamily, fontSize: typography.h1, lineHeight: 30, fontWeight: '900', color: colors.ink },
  pageSubtitle: { fontFamily: typography.fontFamily, color: colors.inkSoft, fontSize: typography.bodySmall, lineHeight: 18, marginTop: 3 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: spacing.md },
  sectionTitle: { fontFamily: typography.fontFamily, fontSize: typography.h2, fontWeight: '900', color: colors.ink },
  sectionAction: { fontFamily: typography.fontFamily, color: colors.greenDark, fontSize: typography.bodySmall, fontWeight: '900' },
  button: {
    width: '100%',
    height: layout.buttonHeight,
    alignSelf: 'stretch',
    borderRadius: radius.button,
    backgroundColor: colors.greenDark,
    overflow: 'hidden',
    borderWidth: 0,
    ...(Platform.OS === 'android' ? { elevation: 0 } : null),
  },
  buttonPressable: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  buttonText: {
    fontFamily: typography.fontFamily,
    color: colors.white,
    fontSize: typography.button,
    fontWeight: '900',
    lineHeight: 20,
    textAlign: 'center' as const,
    ...(Platform.OS === 'android' ? { includeFontPadding: false, textAlignVertical: 'center' as const } : null),
  },
  profileAvatar: { backgroundColor: colors.greenTint, borderWidth: 2, borderColor: colors.green, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  profileAvatarText: { color: colors.greenDark, fontFamily: typography.fontFamily, fontWeight: '900' },
  accountSection: { marginTop: spacing.md, marginBottom: spacing.xs },
  accountSectionTitle: { color: colors.inkSoft, fontSize: 15, lineHeight: 22, marginBottom: spacing.sm },
  accountMenu: { backgroundColor: colors.panel, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.lineSoft, overflow: 'hidden' },
  accountMenuItem: { minHeight: 64, width: '100%', paddingHorizontal: spacing.md, flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', justifyContent: 'space-between' },
  accountMenuItemPressed: { backgroundColor: colors.paper },
  accountMenuItemDivider: { borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  accountMenuLeft: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center' },
  accountMenuChevronWrap: { flexShrink: 0, width: 28, minHeight: 64, alignItems: 'flex-end', justifyContent: 'center' },
  accountMenuIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.greenTint, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  accountMenuIconDanger: { backgroundColor: colors.dangerTint },
  accountMenuLabel: { flex: 1, fontWeight: '800', color: colors.ink },
  accountMenuLabelDanger: { color: colors.danger },
  secondaryButton: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line },
  secondaryButtonText: { color: colors.greenDark },
  orangeButton: { backgroundColor: colors.orange },
  dangerButton: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.danger },
  dangerButtonText: { color: colors.danger },
  disabledButton: { backgroundColor: colors.line },
  disabledButtonText: { color: colors.inkFaint },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  pressedSoft: { opacity: 0.86 },
  card: { backgroundColor: colors.panel, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.lineSoft, padding: spacing.lg, marginBottom: spacing.md },
  searchWrap: { height: 52, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.lineSoft, borderRadius: 15, paddingHorizontal: 13, marginTop: 2 },
  search: { flex: 1, width: 'auto', height: layout.inputHeight - 2, paddingHorizontal: spacing.sm, borderWidth: 0, backgroundColor: 'transparent' },
  clearSearch: { paddingLeft: spacing.xs },
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
  addButton: { width: 44, height: 44, borderRadius: 11, backgroundColor: colors.greenDark, alignItems: 'center', justifyContent: 'center', marginLeft: 5, overflow: 'hidden' },
  chip: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 13, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  chipSelectedGreen: { borderColor: colors.greenDark, backgroundColor: colors.greenTint },
  chipSelectedOrange: { borderColor: colors.orange, backgroundColor: colors.orangeTint },
  chipText: { fontFamily: typography.fontFamily, fontSize: 12, fontWeight: '800', color: colors.inkSoft, ...(Platform.OS === 'android' ? { includeFontPadding: false, textAlignVertical: 'center' as const } : null) },
  chipTextSelectedGreen: { color: colors.greenDark, fontWeight: '900' },
  chipTextSelectedOrange: { color: colors.orangeDark, fontWeight: '900' },
  emptyState: { alignItems: 'center', paddingVertical: 30, marginTop: spacing.md },
  emptyIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.greenTint, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: typography.fontFamily, fontSize: 18, fontWeight: '900', color: colors.ink, marginTop: 12, textAlign: 'center' },
  emptyMessage: { fontFamily: typography.fontFamily, color: colors.inkSoft, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 5, maxWidth: 290 },
  emptyAction: { width: 190, marginTop: 14 },
  stateCenter: { alignItems: 'center', paddingVertical: 48 },
  stateLabel: { marginTop: spacing.md, color: colors.inkSoft, textAlign: 'center' },
  errorText: { color: colors.danger, fontWeight: '700' },
  errorTextSpaced: { marginTop: spacing.sm },
  errorAction: { marginTop: spacing.md },
  textAction: { minHeight: layout.minTouch, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing.xs },
  textActionBordered: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: 14 },
  textActionText: { fontFamily: typography.fontFamily, fontSize: typography.body, fontWeight: '800' },
  optionCard: { minHeight: 58, borderWidth: 1, borderColor: colors.lineSoft, borderRadius: radius.md, padding: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.paper },
  optionCardSelected: { borderColor: colors.green, backgroundColor: colors.greenTint },
  optionCardDisabled: { opacity: 0.5 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', marginRight: 9 },
  radioSelected: { borderColor: colors.greenDark },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.greenDark },
  optionCopy: { flex: 1, minWidth: 0, marginRight: spacing.sm },
  optionTitle: { color: colors.ink, fontFamily: typography.fontFamily, fontSize: 13, fontWeight: '900' },
  optionSub: { color: colors.inkSoft, fontFamily: typography.fontFamily, fontSize: 10, marginTop: 2 },
  optionPrice: { color: colors.greenDark, fontFamily: typography.fontFamily, fontSize: 14, fontWeight: '900' },
  fieldLabel: { color: colors.ink, fontFamily: typography.fontFamily, fontSize: 12, fontWeight: '900', marginBottom: 5 },
  selectField: { minHeight: layout.minTouch, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.paper },
  selectText: { color: colors.ink, fontFamily: typography.fontFamily, fontSize: 14, fontWeight: '800' },
  stepper: { height: layout.minTouch, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', alignSelf: 'flex-start' },
  stepperCompact: { height: 34, borderWidth: 0, borderRadius: 11, backgroundColor: colors.greenTint, marginLeft: 5, overflow: 'visible' },
  stepperButton: { width: layout.minTouch, height: layout.minTouch, alignItems: 'center', justifyContent: 'center' },
  stepperButtonCompact: { width: 32, height: 34 },
  stepperValue: { minWidth: 24, textAlign: 'center', color: colors.ink, fontFamily: typography.fontFamily, fontSize: 14, fontWeight: '900' },
  stepperValueCompact: { minWidth: 20, color: colors.greenDark, fontSize: 13 },
  sheetBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { maxHeight: '85%', backgroundColor: colors.panel, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, paddingHorizontal: spacing.lg + 2, paddingTop: spacing.lg + 2 },
  sheetTitle: { marginBottom: spacing.sm },
  sheetSubtitle: { color: colors.inkSoft, marginTop: -spacing.xs, marginBottom: spacing.md },
  sheetRow: { minHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.lineSoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.sm },
  sheetRowSelected: { backgroundColor: colors.greenTint },
  sheetRowText: { color: colors.ink, fontFamily: typography.fontFamily, fontSize: 14, fontWeight: '800' },
  sheetRowEnd: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sheetRowDetail: { color: colors.greenDark, fontFamily: typography.fontFamily, fontSize: 13, fontWeight: '800' },
  toastContainer: { position: 'absolute', left: spacing.lg, right: spacing.lg, zIndex: 10000 },
  toastContainerCentered: { alignItems: 'center' },
  toast: { ...elevation.md, borderRadius: radius.button, paddingHorizontal: spacing.lg, paddingVertical: 13 },
  toastBrand: { backgroundColor: colors.greenDeep },
  toastNeutral: { backgroundColor: colors.toast },
  toastPill: { borderRadius: radius.pill, paddingVertical: 11, maxWidth: '88%' },
  toastText: { color: colors.white, fontFamily: typography.fontFamily, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  toastTextCentered: { textAlign: 'center' },
});
