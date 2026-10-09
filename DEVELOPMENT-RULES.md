# Mobile Development Rules

## 1. Cross-application parity
- Customer-facing business behaviour must match the current Website implementation unless a Mobile-specific platform constraint requires a different implementation mechanism.
- Admin operational/data rules must not be contradicted by Mobile.
- Read `docs/reference/website/` and `docs/reference/admin/` before implementing cross-application functionality.

## 2. Source of truth
- The latest supplied Mobile ZIP is the Mobile source of truth.
- Current source code takes precedence over historical phase documents.
- Website and Admin reference documents are supporting cross-application specifications and must be reconciled against their current source when details are unclear.

## 3. Do not invent behaviour
- Do not introduce a Mobile-only business rule when the Website already defines the customer behaviour.
- Do not simplify payment, inventory, delivery-date, subscription or enquiry logic merely to fit a Mobile screen.
- If a rule is unclear, inspect the corresponding Website/Admin implementation before changing Mobile behaviour.

## 4. Payment and inventory
- Cashfree server-side verification is authoritative.
- Never expose Cashfree secrets in Mobile.
- Pending, failed or abandoned payment must not be treated as successful order/inventory commitment.
- Cart operations must not consume inventory.
- Packing consumes inventory; handover/delivery must not perform a second inventory deduction.

## 5. Customer delivery availability
- Match Website smart delivery-date behaviour.
- Actual shortage/date changes require the equivalent customer confirmation flow.
- A future batch that has not yet been created is not automatically treated as unavailable.
- Yes/No outcomes must preserve the Website flow for accepted delivery dates versus enquiry/removal.

## 6. Data model terminology
- **Microgreen** = production/growing master.
- **Product** = customer-facing salable product.
- Selling options belong to the Product and represent customer packaging/selling choices.
- Inventory quantities are gram-based.

## 7. Regression protection
- Preserve existing Mobile features while adding parity work.
- Do not remove working Cashfree SDK fixes, patches, authentication/session behaviour, cart isolation, checkout, subscription, wallet, notification or feedback functionality without an explicit requirement.
- Run `npm run typecheck` after meaningful code changes when dependencies/environment permit.
## 8. Documentation-first development
- For every new Mobile feature or architectural change, update the relevant current-state/decision Markdown document **before implementation**.
- The updated Markdown must define the approved flow, boundaries, dependencies, and non-negotiable rules.
- Implementation must then follow the updated Markdown; do not invent a different flow during coding.
- If implementation reveals a genuine architectural gap, stop implementation, update the Markdown decision first, then continue.
- Authentication changes must specifically follow `docs/MOBILE-AUTHENTICATION-DECISION.md`.

## 9. Mobile API Boundary — Mandatory

Mobile must NOT use Website APIs for normal customer functionality.

Website/server API dependencies are limited to two explicit exceptions:

1. Existing Cashfree/payment processing.
2. Final UAT customer authentication OTP API.

The authentication exception is narrowly scoped to:

```text
send OTP
verify OTP
Firebase Admin customer identity resolution
Firebase custom-token creation
server-side SMS delivery
```

Authentication is governed by:

`docs/MOBILE-AUTHENTICATION-DECISION.md`

Website APIs remain prohibited for:

- profile / addresses
- products / packaging / selling options
- cart
- availability / production threshold
- delivery-date calculation
- orders
- subscriptions
- notifications
- feedback
- other normal customer functionality

Do not expand either exception into a general Website API dependency.

Before adding any new API call to Mobile, verify that it is part of one of these explicitly approved server-side exceptions and update the architecture MD first.

## 11. Phase 0 Architecture Guardrail
- Normal customer functionality must not use Website APIs.
- The approved Website/server API dependencies are the existing Cashfree/payment-processing flow and the narrowly scoped Final UAT authentication OTP API documented in `docs/MOBILE-AUTHENTICATION-DECISION.md`.
- Run the Mobile architecture boundary check before introducing or completing network-related changes.
- If a new server/API dependency is required, update the architecture MD first.

## 10. Documentation-First Guardrail

Before implementation, update the relevant MD when scope, architecture, data flow, or business rules are involved. If the implementation conflicts with the MD, stop and update the MD before continuing.

## 12. Phase completion gate

A phase is not considered complete merely because code was changed.

For phases marked as requiring manual verification, the developer must perform the documented runtime checks before starting the next phase.

Authentication is the first mandatory manual-verification phase.


## Phase 2 — Home

Before changing Home or its product-data behavior, update `docs/PHASE-2-HOME.md` first. Home must use Firebase/Firestore for product discovery and must not introduce Website API dependencies.


### Cart parity rule
Cart must follow the Website Product-wise purchase model. Packaging, one-time pricing, subscription plans, subscription selling-option pricing, quantity behavior, and cart selection replacement must not be re-invented in Mobile.


### Cart ordering rule
Cart mode changes are replacements, not remove-and-append operations. Preserve the existing Product position when switching one-time and subscription modes.

## Phase 5 availability boundary
- Availability and production threshold must be calculated directly from Firebase/Firestore in Mobile.
- Do not reintroduce `/api/customer/production-threshold` or any Website availability API.
- Threshold exceeded means no order and no payment; only Send Enquiry is allowed.
- A created but not-started batch does not count as actual production.
- Partial delivery is never accepted; resolve to the first future Saturday that can fulfil the complete requested quantity.


## Phase 10 API Boundary Exception
The existing Website subscription delivery-action endpoint is an approved, narrowly scoped Mobile API exception for Reschedule Delivery because it requires the Website Admin SDK transaction. Skip Delivery is not supported. Mobile must not call other Website APIs for normal customer functionality.


## Mobile UI Standard — Mandatory for Every Screen (UI Baseline)

This standard applies to **all existing and new customer-facing screens**, not only screens currently reported as broken. It is the default implementation contract for UI work. Implementation status and the migration tracker live in `docs/PHASE-8-UI-UX-STANDARDIZATION.md` §16.

### Approved styling technology
- Use React Native's built-in `StyleSheet` and the existing shared design-system components/tokens.
- Do **not** use NativeWind, Tailwind CSS, `className` styling, `jsxImportSource: 'nativewind'`, `withNativeWind`, or a styling library unless the project owner explicitly approves a new decision in Markdown first.
- Reason (confirmed root cause, 2026-10-09): NativeWind v4's JSX runtime (`react-native-css-interop` 0.2.7) replaced function-valued `Pressable.style` props with `{}`, which removed the shared Button's background/geometry and other Pressable layouts. The app used no `className` styling.
- NativeWind removal must be preceded by an audit of every screen, component, dependency, config and build script for actual NativeWind usage. Replace legitimate usage with `StyleSheet` before removing its configuration/dependencies. Preserve all current UI behavior and visual intent.
- Do not add a replacement styling library.

### Single source of visual truth
- `constants/theme.ts` is the source of truth for colors, spacing, radii, typography and layout dimensions. Extend it when a reusable token is missing; do not create near-duplicate tokens.
- Shared components in `components/UI.tsx` (or the agreed shared-component module) own reusable UI behavior and styling: `Screen`, `AppText`, `Button`, `AppInput`, `AppCard/Card`, `AppIconButton`, `SectionHeader`, `ProfileAvatar`, product cards, quantity controls, loading/empty/error states and other repeated patterns.
- Screens compose shared components and define only screen-specific layout. Do not independently reimplement standard buttons, text inputs, cards, headers, tab bars, badges, quantity controls or repeated states.
- Avoid arbitrary hard-coded colors and dimensions in screens. Use design tokens; exceptions must be documented and genuinely content-specific.

### Required shared Button implementation
- The visual surface must be a native `View` (background, border, radius, geometry and disabled appearance); a nested `Pressable` fills that surface and owns interaction/ripple/accessibility. Do not rely on a function-valued `Pressable.style` to render the button's essential geometry.
- Standard button height is 50 dp unless a documented compact variant is needed. Interactive targets must be at least 44 dp in both dimensions where practical.
- Button label/loading indicator must be vertically and horizontally centered. Support primary, secondary, orange, danger, disabled, loading and pressed states without changing the calling screen's behavior.
- Keep the complete visual area clickable. Expose `accessibilityRole="button"`, a useful accessible label/state, and appropriate Android ripple behavior. Do not let text scaling clip or displace the label.
- `style` props supplied by callers may extend documented layout properties but must not accidentally erase the required base geometry or make the hit target smaller.

### Layout, safe areas and responsiveness
- Use the shared `Screen`/layout primitives and `react-native-safe-area-context`. Status bar, system navigation area, fixed header and bottom tabs must be handled centrally. Scrollable content must reserve space for fixed navigation and bottom safe-area insets.
- Use Flexbox and available width; do not assume one device width. Use `useWindowDimensions()` only where responsive breakpoints/layout genuinely require it.
- Avoid fixed screen-sized containers and absolute positioning for normal content. Keyboard-visible forms must remain usable and scrollable.
- Keep row items aligned with explicit flex layout: labels and values must not overlap; trailing icons/chevrons must be vertically centered and have consistent spacing.
- Images must preserve aspect ratio and have robust loading/error/fallback behavior. Profile images must not disappear silently when a URI fails.
- Use the installed icon set (`MaterialCommunityIcons`) instead of Unicode glyphs for interface icons.

### Typography and touch behavior
- Use shared `AppText` variants and typography tokens. Preserve user font scaling; use `maxFontSizeMultiplier` only for compact controls where necessary and document the reason.
- Avoid text truncation unless intentional; test long product names, long labels, prices, empty states and translated/large-font layouts.
- Every interactive element needs an adequate hit target, accessible label/role, clear disabled/loading state, and visible feedback.

### All-screen audit and migration rule
- Before implementation, inventory every route/screen, modal, shared component and reusable control. Search globally for `className`, NativeWind imports, function-valued `style={({ pressed }) => ...}`, duplicate button/input/card implementations, hard-coded colors, fixed dimensions, unsafe-area handling and local header/tab implementations.
- Do not assume a screen is compliant because it uses React Native `StyleSheet`; check its actual runtime layout, token usage, touch area, accessibility, safe areas and responsive behavior.
- Classify each finding as: global/shared-component fix, screen composition/layout fix, content/data issue, or behavior/business-rule issue. Fix shared causes centrally; use a screen-specific change only when the issue is truly unique to that screen.
- Analysis-only work must not change application source. First return the inventory, evidence (file and line), root cause, severity, proposed shared-component/token changes, screen migration matrix, dependencies/risks, and validation plan. The owner will then provide a separate implementation prompt.
- During implementation, update the relevant Markdown decision first, then change code, then run typecheck/build and regression checks. Keep business rules, Firebase architecture, authentication, cart/order, subscription, inventory and Cashfree behavior unchanged unless separately authorized.

### Required validation matrix
- Static checks: `npm run typecheck`, `npm run check:architecture` and `node scripts/check-cashfree-mixed-payment-alignment.cjs`.
- Build: Android development build where the environment supports it. A successful typecheck is not proof that NativeWind removal or runtime styling works.
- Screen coverage: Login/OTP, Home, Catalogue, Product Detail, Cart, Checkout, Payment/Recovery, Orders, Order Details, Profile, Addresses, Subscriptions, Delivery Calendar/Journey, Notifications, Feedback and every additional route/modal found in the repository. Include loading, empty, error, disabled, pressed and long-content states where relevant.
- Device/layout coverage: narrow Android, regular Android, iOS if supported, keyboard open, system status/navigation bars, bottom tabs, and large system font. Use emulators/simulators if available; clearly list physical-device checks that were not performed. Never claim unperformed tests.
- Regression: verify navigation, button actions, cart quantities, checkout/payment recovery, account/profile photo fallback, address flows, subscription/delivery actions and existing authentication. Do not mark the baseline complete until results and remaining manual checks are documented.
- Status vocabulary for every document: **Implemented and verified** (runtime/device check performed), **Implemented, not runtime-verified**, **Planned, not implemented**, **Requires owner decision**. A changelog entry is never evidence by itself.
