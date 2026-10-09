# Seedlings Mobile — UI Baseline Implementation Report (2026-10-09)

Source baseline: the audited `seedlings_mobile_otp_error_handling_fixed` source (inside `seedlings_mobile_account_layout_profile_visibility_fixed`). Standard: `DEVELOPMENT-RULES.md` → "Mobile UI Standard". Tracker: `docs/PHASE-8-UI-UX-STANDARDIZATION.md` §16.

Status vocabulary: **Verified** = observed on the physical device. **Not runtime-verified** = implemented, static checks only.

## 1. Test environment
- Physical Android device `2312DRA50I`, Android 16, 3-button navigation, 1220×2712 px @ 480 dpi (~406 dp wide), already running a debuggable build of this app.
- JS served by a fresh, cache-cleared Metro (`npx expo start -c`, port 8082, device port 8081 reverse-mapped for the session). The developer's own Metro on 8081 was left running and untouched; the reverse mapping must be restored to `tcp:8081 tcp:8081` (done at the end of the session).
- Extra passes: 360 dp width (`adb shell wm size 1080x2712`) and system font scale 1.5; both restored afterwards.

## 2. Static checks
| Check | Baseline (before) | After |
|---|---|---|
| `npm run typecheck` | 50 errors (21 in screens, 29 in services) | 36 errors; **no new errors**. The 7 remaining in `app/` are on unchanged logic lines (`CustomerOrder.deliveryDate` typing, implicit-`any` in cart logic, `form.mobileNumber` in addresses). Service errors are untouched (out of scope). |
| `npm run check:architecture` | passed | passed |
| `node scripts/check-cashfree-mixed-payment-alignment.cjs` | passed (5 checks) | passed (5 checks) |
| `npx expo export --platform android` (after Batch 1) | — | succeeded (Hermes bundle 4.2 MB) |
| Android native build `./gradlew assembleDebug` (locally prebuilt `android/`) | — | BUILD SUCCESSFUL in 26m 14s (635 tasks). APK not installed over the device's existing build. |
| Protected directories (`services`, `store`, `storage`, `firebase.ts`, `google-services.json`, `storage.rules`, `patches`, `scripts`, `app.json`, `eas.json`) | — | byte-identical to baseline |
| Event-handler comparison (every `onPress`/`onRequestClose`/`onRefresh`/`onChangeText` expression, baseline vs now) | — | all handlers preserved; differences are only re-routing through shared props (`onClose`, `onRetry`, `onDecrease`/`onIncrease`, `onSelect`). Product packaging handler and start-date computation verified text-identical after being moved. |

## 3. Batch results
### Batch 0 — Documentation
`DEVELOPMENT-RULES.md` (UI Standard), PHASE-8 (styling decision + §16 tracker), status corrections in `CHANGELOG.md`, `PHASE-14`, `README.md`, `SEEDLINGS_MOBILE_ACCOUNT_UI_UX_PROFILE_SYNC_PHASE.md`; Pause/Cancel conflict marked **Requires owner decision** in `MOBILE-APP-DEVELOPMENT-BASELINE.md` and `PHASE-9-SUBSCRIPTIONS.md`.

### Batch 1 — NativeWind/Tailwind removal
Removed `import '../global.css'`, Babel `jsxImportSource: 'nativewind'` + `nativewind/babel`, `withNativeWind`, `global.css`, `tailwind.config.js`, `nativewind-env.d.ts`; `npm uninstall nativewind tailwindcss` (lockfile regenerated; `react-native-css-interop` removed transitively). Kept `react-native-reanimated` and `react-native-worklets`.
**Verified:** app starts on the cache-cleared bundle; immediately after removal the Home "Shop Fresh" pill and Cart checkout button regained their backgrounds (runtime confirmation of the root cause), and the checkout label sat at the top of the button (confirming the separate centering defect).

### Batch 2 — Shared Button and Pressables
`Button`: outer `View` (surface, variant, disabled, pressed, caller `style`) + inner `Pressable` (`flex: 1`, centered, ripple, accessibility label/state). Pressed state via `usePressedState` (no function-valued style). Label capped at `typography.controlMaxFontScale` (1.3) because the control has a fixed 50 dp height. Loading spinner colour: danger → danger, secondary → green, primary → white.
`AccountMenuItem`, `AppIconButton`, `ProductCard`, Home hero: static geometry + `usePressedState`.
**Verified:** Cart checkout button green, 50 dp (bounds 1124×150 px), label centered; taps 12 px inside each of the four corners all opened Checkout; Account menu rows; Sign out (danger + caller `style`); Pause/Cancel (secondary + caller `style={{flex:1}}`) side by side; secondary "Mark all as read", "View Delivery Calendar". **Not runtime-verified:** disabled and loading appearance (no such state reachable without performing a real action).

### Batch 3 — Navigation and layout
- Root tabs: `usePathname()` returns `/`, `/products`, `/cart`, `/orders`, `/profile`. **Verified:** no back arrow on all five tabs; back arrow (44 dp) shown and working on pushed screens.
- Cart tab: icon slot = 28 dp; 44 dp circle anchored to the slot bottom (protrudes upward). **Verified:** "Cart" label fully visible; circle not clipped.
- Header and other glyphs replaced with `MaterialCommunityIcons`. **Verified.**
- Tab-screen bottom padding: measured the tab scene ends at the tab-bar top (scroll view bottom y=2378 vs tab items y=2408), so `tabBarHeight + inset` was double-counted (~112 dp blank). Tab screens now add only `screenBottomGap`; stack screens add `insets.bottom + screenBottomGap`. **Verified** on Account tab, Profile, Product, Order detail, Notifications.
- Account `paddingTop: 84` workaround removed. **Verified.**
- Toasts use safe-area insets. **Verified** (bottom exit toast above tab bar). Top foreground-push toast: not runtime-verified.
- Non-scroll `Screen` content now `flex: 1`; no route still uses non-scroll mode.

### Batch 4 — Tokens and shared components
Tokens added to `constants/theme.ts` (all derived from existing usage): `colors.dangerTint` (chosen from the two existing near-duplicates `#FCE7E4`/`#FDECEC` → `#FCE7E4`), `overlay` (`rgba(0,0,0,0.42)`, consolidating 0.35/0.42/0.45), `shadow`, `toast`, `rippleLight` (existing) and `rippleDark` (new, for outlined buttons), `radius.button` (14, existing Button radius), `radius.sheet` (22, existing sheet radius), `layout.buttonHeight/inputHeight` (50), `layout.minTouch` (44), `layout.compactControlHeight` (38), `typography.controlMaxFontScale` (1.3), `elevation.sm/md` (existing shadow values).
Components added in `components/UI.tsx`: `usePressedState`, `BottomSheet` (safe-area padding, backdrop/back dismissal, optional `closeOnBackdrop`), `SelectSheet`, `SelectField`, `OptionCard` (radio role), `QuantityStepper` (44 dp regular; compact with `hitSlop`), `TextAction` (≥44 dp target, optional bordered), `LoadingState`, `ErrorState`, `Toast`; `AppInput` gained `multiline`, `accessibilityLabel`, optional `onChangeText`; `Chip` gained accessibility state and static selected styles; `SearchBar` double border removed and glyphs replaced; `EmptyState` emoji replaced with an icon; `Screen` gained keyboard avoidance and `refreshControl`.
Card radius: `AppCard` default (`radius.xl` = 20) adopted for migrated cards (previously 14 in several screens) — a deliberate, documented visual migration.

### Batch 5 — Route migration (all 24 audited entries)
| # | Route | Change | Device status |
|---|---|---|---|
| 1 | `app/_layout.tsx` | Toasts → shared `Toast`; hard-coded colours removed | Verified (bottom toast) |
| 2 | `app/index.tsx` (splash) | Bottom sprout icon offset by safe-area inset (was drawn over the nav bar) | Verified (overlap seen before; after fix the icon sits above the nav bar — captured from a launch screen recording) |
| 3 | `(customer)/_layout.tsx` | Root-tab detection, icons, StyleSheet, font cap | Verified |
| 4 | `(tabs)/_layout.tsx` | Cart icon geometry, tokens | Verified |
| 5 | Home | Hero static style, quick-card icons/labels, loading state, StyleSheet | Verified (406 dp, 360 dp, font 1.5) |
| 6 | Products | `LoadingState`/`ErrorState`, StyleSheet | Verified (loaded state) |
| 7 | Cart | `SelectField`/`SelectSheet`, `OptionCard`, `QuantityStepper`, `AppCard`, `PageTitle`; nested ScrollView removed | Verified (render, +/− quantity, sheet open/close by backdrop, font 1.5) |
| 8 | Orders | `Chip`, `AppCard`, `PageTitle`, `LoadingState`, `ErrorState`, `TextAction` | Verified (list, filters All/One Time) |
| 9 | Account tab | StyleSheet, header workaround removed | Verified |
| 10 | Account → Profile | `LoadingState`, `TextAction` (Remove photo), input labels | Verified (render, bottom spacing) |
| 11 | Addresses | `PageTitle`, `Chip`, `TextAction` (bordered), `AppCard`, `LoadingState`, StyleSheet | Verified (list, add form, keyboard reachability; cancelled without saving) |
| 12 | Subscriptions | `PageTitle`, `LoadingState`, StyleSheet | Verified (render; actions not pressed) |
| 13 | Delivery calendar | `BottomSheet` ×2 (no backdrop dismissal, as before), 44 dp month buttons, coloured legend, day-cell labels | Verified (calendar, detail sheet open/Close; reschedule not performed) |
| 14 | Notifications | `Screen` + `refreshControl` (single ScrollView), StyleSheet | Verified (scroll to end, pull-to-refresh indicator) |
| 15 | Feedback | Multiline `AppInput`, icon stars (44 dp), remove-photo `hitSlop`, `LoadingState`/`ErrorState` | Empty state verified; rating form not reachable (no delivered orders) |
| 16 | Wallet (unlinked) | `Screen` + `refreshControl`, `AppCard`, `PageTitle` | Not runtime-verified (no in-app route; not newly linked) |
| 17 | About (unlinked) | StyleSheet; unused imports removed | Not runtime-verified (no in-app route) |
| 18 | Login | Scrollable keyboard-aware `Screen`, StyleSheet | Not runtime-verified (would require signing out) |
| 19 | OTP | Scrollable keyboard-aware `Screen`, StyleSheet, `TextAction` resend | Not runtime-verified (would require signing out + OTP) |
| 20 | Checkout | `PageTitle`, `AppCard`, `TextAction` "Change", `loading={validating}` (same effect as the previous no-op handler) | Verified (render: subtotal ₹180, offer −₹18, delivery ₹57, total ₹219; payment not started) |
| 21 | Payment status | StyleSheet, `dangerTint` | Not runtime-verified (requires a payment attempt) |
| 22 | Success | StyleSheet, icon checkmark | Not runtime-verified (requires a completed order) |
| 23 | Order detail | `AppCard`, `LoadingState`/`ErrorState`, StyleSheet (69 inline styles removed) | Verified (render, bottom spacing) |
| 24 | Product detail | Wrapped in `Screen` (safe-area bottom), shared selector/option/stepper/sheets | Verified (render, bottom spacing) |

## 4. Intentional visual differences (no behaviour change)
- Migrated cards use the `AppCard` radius (20) instead of local 14.
- Product packaging/start-date pickers are bottom sheets (previously centred dialogs) — same as Cart.
- Product one-time/plan options use the Cart radio style (dot) instead of the filled circle.
- Orders filter chips use the shared `Chip` (tinted selected state) instead of solid green.
- Feedback comment box uses the shared input surface (white) instead of the block colour.
- New page titles on Addresses ("Delivery Addresses") and Wallet ("Wallet").
- Glyphs (‹ › ⌖ ⌄ ⌕ × ★ → ✓ 🗑 🌱 🌿) replaced by `MaterialCommunityIcons`; content text (e.g. "100g × 1", greeting emoji) unchanged.

## 5. Behaviour deliberately NOT changed (recommendations for owner)
- Addresses "Save" is not disabled while saving (a second tap can still submit twice). Recommend `loading={saving}` — not applied because it changes address CRUD behaviour.
- Header "Deliver to" row shows a chevron but is not tappable (unchanged).
- OTP screen still displays the "Demo mode…" explanatory sentence (authentication copy; out of scope).
- `Order` cards show "Ordered —" when `createdAt` is missing (data issue, unchanged).

## 6. Owner decisions outstanding
1. Wallet and About routes are not linked from any screen — keep hidden, link, or remove? (Unchanged.)
2. Subscription Pause/Cancel: BASELINE prohibits, PHASE-9 and source allow. (Unchanged; marked in both docs.)
3. `colors.dangerTint` value: `#FCE7E4` chosen from two existing near-duplicates; confirm.

## 7. Device tests NOT performed
- Login and OTP screens (keyboard, layout) — would require signing out.
- Button disabled and loading states on device.
- Payment status, Success, Wallet, About screens.
- Feedback rating form, photo add/remove (no delivered orders).
- Subscription Pause/Resume/Cancel, delivery reschedule, address save/edit/delete, profile photo change — not executed to avoid changing live customer data.
- Top foreground-push toast.
- Gesture-navigation mode (device uses 3-button navigation), iOS, tablets.
- Android versions other than 16: keyboard handling now uses `KeyboardAvoidingView` `padding` on Android because this edge-to-edge build does not resize the window for the IME; on a device that does resize, this could add extra space — verify on an older Android version.
- Focused inputs are reachable by scrolling above the keyboard but are not auto-scrolled into view.

## 8. Android native build
`cd android && ./gradlew assembleDebug` with `ANDROID_HOME=$HOME/Android/Sdk` → **BUILD SUCCESSFUL in 26m 14s**, 635 actionable tasks, debug APK produced at `android/app/build/outputs/apk/debug/`. The `android/` directory is a locally generated prebuild (git-ignored) and is not part of the source ZIP. The APK was not installed; on-device verification used the already-installed debuggable build with the new JS bundle. No native dependency changed except removal of the JS-only `nativewind`/`tailwindcss` packages.
