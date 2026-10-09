# Seedlings Mobile --- UI/UX Standardization Development Phase

## Objective

Create one standardized Mobile UI/UX foundation before Phase 9. This is
a development phase, not individual UI bug fixing.

## Scope

-   Global layout and safe areas
-   Fixed header
-   Fixed bottom navigation
-   Buttons and states
-   Typography, colors, spacing, radius, borders and elevation
-   Inputs, selectors, cards and quantity controls
-   Modals/dialogs
-   Loading, empty and error states
-   Product/cart/checkout controls
-   Existing screen migration to shared UI components
-   Android device validation

## Architecture

The app will use one shared UI/design-system layer. Screens must reuse
shared components instead of implementing repeated custom styling.

The objective is consistent reusable UI. The approved styling approach is
React Native `StyleSheet` + `constants/theme.ts` design tokens + shared
components in `components/UI.tsx`. NativeWind/Tailwind are not approved
and are removed by the UI baseline (§16); they must not be reintroduced
without an approved Markdown decision. See `DEVELOPMENT-RULES.md`
"Mobile UI Standard".

## Shared Components

Standardize: - AppHeader - BottomTabBar - Button - IconButton - Text -
Input - Select/Dropdown - Card - Badge - QuantityControl -
Modal/Dialog - Loader - EmptyState - ErrorState - ProductCard -
SectionHeader - ImageContainer

## Layout Rules

### Header

-   Safe-area aware
-   Fixed while content scrolls
-   Never hidden behind the Android status bar
-   Consistent height and padding

### Bottom Navigation

-   Fixed to the bottom
-   Safe-area/navigation-bar aware
-   Never hidden behind Android navigation controls
-   Content reserves bottom space

### Buttons

All buttons use the shared Button component: - Full touch surface -
Correct text alignment - Consistent height/padding - Standard variants -
Disabled/loading/pressed states - Android-compatible rendering

## Existing Screens

Migrate all existing screens to the shared system: Login, OTP, Home,
Catalogue, Product Detail, Cart, Checkout, Payment/Recovery, Orders,
Order Details, Profile, Addresses, and existing
Subscription/Delivery/Journey screens.

Business behavior must not change.

## Validation

1.  Validate shared components.
2.  Validate representative screens.
3.  Validate on physical Android device for status bar, navigation bar,
    scrolling, keyboard and touch areas.
4.  Fix the shared component rather than creating screen-specific fixes.

## Regression Rules

-   Reuse shared components.
-   Do not duplicate UI implementations.
-   Use design tokens instead of arbitrary values.
-   Keep header/bottom-navigation behavior centralized.
-   Do not change business/payment/Firebase architecture.

## Completion Criteria

-   Shared UI system implemented and used across existing screens.
-   Header and bottom navigation consistently safe-area aware.
-   Buttons have consistent appearance and full touch areas.
-   Major UI/UX inconsistencies resolved.
-   Representative physical-device verification passes.
-   Documentation/changelog updated.
-   UI baseline frozen before Phase 9.

## Workflow

Update MD → inspect latest source → define design system → implement
shared components → migrate screens → typecheck/build → physical-device
verification → regression → freeze UI baseline → Phase 9.

## Architecture Constraints

-   Latest Mobile source is implementation source of truth.
-   Website remains business-behavior reference.
-   Firebase/Firestore direct architecture remains unchanged.
-   Cashfree remains the approved payment API boundary.
-   Firebase Functions must not be introduced.


## 15. Button Root-Cause Implementation Note

The shared Button must render its visual surface in a dedicated native `View`, with the `Pressable` used as the full-size interaction layer inside it.

This avoids relying on the Android `Pressable` surface itself to render the background while also handling ripple/pressed behavior. The outer surface owns background, border, radius and disabled styling; the inner `Pressable` owns the complete touch target and interaction state.

This is the required implementation pattern for the standardized Button. Do not create screen-specific button fixes.


## 16. UI Baseline (StyleSheet) — Plan, Acceptance and Status Tracker

Source baseline: `seedlings_mobile_otp_error_handling_fixed` (inside `seedlings_mobile_account_layout_profile_visibility_fixed`), audited 2026-10-09.

### 16.1 Confirmed root cause of the invisible/untappable Button
`babel.config.js` set `jsxImportSource: 'nativewind'`, so every JSX element was routed through `react-native-css-interop` 0.2.7. Its inline-style handling spreads a function-valued `style` into `{}` (`native-interop.js` `applyRules`) and the result replaces the original prop (`render-component.js`). Every `Pressable` with `style={({ pressed }) => ...}` lost its style: shared `Button` (no background/height), `AccountMenuItem` (no row layout), `AppIconButton` (no 44dp size), Home hero button, `ProductCard` and Notification rows (pressed feedback). Independently, `styles.button` had no `alignItems`/`justifyContent`, so the label was never vertically centered. No `className` usage existed.

### 16.2 Status vocabulary
**Implemented and verified** = runtime/device check performed and recorded. **Implemented, not runtime-verified** = code changed, static checks only. **Planned, not implemented**. **Requires owner decision**.

### 16.3 Batches (status as of 2026-10-09)
Device used for runtime checks: physical Android device `2312DRA50I`, Android 16, 3-button navigation, 1220×2712 @ 480dpi (~406dp wide); additional passes at 360dp width (`wm size 1080x2712`) and system font scale 1.5 (both restored afterwards). JS served from a cache-cleared Metro (`expo start -c`) to the installed debug build. Full detail: `docs/UI-BASELINE-IMPLEMENTATION-REPORT.md`.

| Batch | Scope | Status |
|---|---|---|
| 0 | MD-first: DEVELOPMENT-RULES UI Standard, this section, status corrections in CHANGELOG / PHASE-14 / README / Account UI phase doc, Pause/Cancel conflict markers | Implemented (documentation) |
| 1 | NativeWind/Tailwind removed (`global.css` import, Babel `jsxImportSource` + plugin, `withNativeWind`, `global.css`, `tailwind.config.js`, `nativewind-env.d.ts`, `npm uninstall nativewind tailwindcss`). Reanimated/Worklets kept. | Implemented and verified — bundle export, `./gradlew assembleDebug` BUILD SUCCESSFUL, app start on device; function-valued styles render again |
| 2 | Shared `Button` = outer `View` surface + inner full-size `Pressable`, static geometry, centered, 50dp; `AccountMenuItem`, `AppIconButton`, `ProductCard`, Home hero use static geometry + `usePressedState` | Implemented and verified — primary/secondary/danger, caller `style` (Sign out, Pause/Cancel), centering, 4-corner taps. Disabled and loading variants: implemented, not runtime-verified |
| 3 | Root-tab detection, Cart tab label, header icons, safe-area toasts, non-scroll `Screen` flex, tab bottom inset (measured), Account `paddingTop: 84` removed | Implemented and verified (top foreground-notification toast: implemented, not runtime-verified) |
| 4 | Tokens (`dangerTint`, `overlay`, `shadow`, `toast`, ripples, `radius.button/sheet`, `layout.buttonHeight/inputHeight/minTouch/compactControlHeight`, `typography.controlMaxFontScale`, `elevation`) and shared `BottomSheet`, `SelectSheet`, `SelectField`, `OptionCard`, `QuantityStepper`, `TextAction`, `ErrorState`, `LoadingState`, multiline `AppInput`, keyboard-aware `Screen` (+ `refreshControl`), `Toast`, accessible `Chip`, fixed `SearchBar` | Implemented; verified where used on device (see report) |
| 5 | All 24 audited routes reviewed and migrated (see report §5) | Implemented; per-route verification status in report |
| 6 | Validation matrix and UI baseline freeze | Partially complete — remaining manual checks listed in report §7; baseline not frozen |

### 16.4 Acceptance criteria
1. No `nativewind`, `tailwind`, `global.css` or `className` reference in app source/config (excluding `node_modules`); Android build/bundle succeeds.
2. Shared Button geometry/background come from static styles; 50dp; primary green; label centered both axes; all four corners tappable; disabled/loading/pressed keep geometry; all call sites reviewed.
3. No essential geometry is rendered through a function-valued `Pressable.style`.
4. No back arrow on the five root tabs; back arrow present on pushed screens.
5. Cart tab label fully visible.
6. Bottom sheets, Product detail and toasts clear the system navigation bar (gesture and 3-button).
7. Notifications scrolls and pull-to-refresh works.
8. Login/OTP actions reachable with keyboard open on a ~360dp device.
9. No hard-coded hex/rgba outside `constants/theme.ts` except documented exceptions.
10. Interactive controls ≥44dp (or `hitSlop`) with accessibility role/label.
11. No clipping at the largest system font in header, tabs, buttons, inputs, quantity controls.
12. Checkout totals, offers, delivery charges and payment results unchanged for the same cart.

### 16.5 Protected behavior (unchanged by this baseline)
Firebase/Firestore access, authentication/OTP/session, customer identity, cart operations and quantity calculations, packaging and one-time/subscription mode logic, checkout totals/offers/delivery charges, order creation/inventory, Cashfree lifecycle and recovery, subscription actions, address CRUD, delivery calendar/reschedule rules, feedback submission/photo upload.

### 16.6 Requires owner decision (current runtime behavior preserved)
- Wallet (`account/wallet.tsx`) and About (`account/about.tsx`) routes are not linked from any screen. Not deleted, not newly linked.
- Subscription Pause/Cancel: `docs/MOBILE-APP-DEVELOPMENT-BASELINE.md` prohibits Pause/Cancel UI, while `docs/PHASE-9-SUBSCRIPTIONS.md` allows them and the source implements them. Unresolved; current behavior kept.
- Earlier documents disagree about the implemented Button; superseded by §16.1 and the tracker above.
