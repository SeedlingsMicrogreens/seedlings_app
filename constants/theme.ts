/** Seedlings visual system — colours are intentionally derived from the Seedlings character artwork. */
export const colors = {
  // Character palette: deep leaf green, fresh microgreen, warm orange and earthy brown.
  green: '#70B52F',
  greenDark: '#3E7D32',
  greenDeep: '#1E542E',
  greenTint: '#EAF4D9',
  leaf: '#4C9437',
  orange: '#F28C28',
  orangeDark: '#C96A16',
  orangeTint: '#FCE8CF',
  brown: '#704727',
  brownDark: '#4A2F1A',
  brownTint: '#F1E4D5',
  paper: '#FAF7F1',
  panel: '#FFFFFF',
  ink: '#24301F',
  inkSoft: '#665F52',
  inkFaint: '#948A7B',
  line: '#D8D0C2',
  lineSoft: '#EAE4D9',
  block: '#F0EADD',
  blockLine: '#CFC3AE',
  danger: '#B94B3C',
  // Light danger surface. Consolidates the previous '#FCE7E4' (account menu) and '#FDECEC' (payment status).
  dangerTint: '#FCE7E4',
  success: '#3E7D32',
  white: '#FFFFFF',
  // Modal/bottom-sheet backdrop. Consolidates the previous 0.35 / 0.42 / 0.45 black overlays.
  overlay: 'rgba(0,0,0,0.42)',
  shadow: '#000000',
  toast: '#222222',
  rippleLight: 'rgba(255,255,255,0.16)',
  rippleDark: 'rgba(62,125,50,0.12)',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };
// `button` is the existing standard Button radius; cards use `xl` (the shared AppCard radius).
export const radius = { sm: 8, md: 12, button: 14, lg: 16, xl: 20, sheet: 22, pill: 999 };

export const typography = {
  fontFamily: 'System',
  display: 26,
  h1: 24,
  h2: 20,
  h3: 17,
  body: 14,
  bodySmall: 12,
  caption: 11,
  button: 14,
  // Fixed-height controls (buttons, inputs, steppers, tab labels) cap font scaling so labels are not clipped.
  controlMaxFontScale: 1.3,
};

export const layout = {
  headerHeight: 62,
  tabBarHeight: 64,
  screenHorizontal: spacing.lg,
  screenTop: spacing.sm,
  screenBottomGap: spacing.lg,
  buttonHeight: 50,
  inputHeight: 50,
  minTouch: 44,
  compactControlHeight: 38,
};

export const elevation = {
  sm: { shadowColor: colors.shadow, shadowOpacity: 0.08, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  md: { shadowColor: colors.shadow, shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 6 },
};
