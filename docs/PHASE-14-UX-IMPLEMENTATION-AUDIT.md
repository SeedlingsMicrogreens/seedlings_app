# Seedlings Mobile — UX Implementation Audit

**Status:** Implemented — validation pending physical Android UAT
**Date:** 2026-10-09
**Baseline audited:** `seedling_mobile_uat_3.zip`

## 1. Purpose

This document records the pre-development UX implementation audit of the current Mobile source. It is an MD-only decision baseline. No source-code behavior is changed by this audit.

The audit checks whether the existing implementation actually follows the previously approved UI/UX standard and identifies corrections required before further feature development.

## 2. Audit Findings

### UX-01 — Header fixed behavior
**Status:** Needs implementation hardening

The current customer header is rendered outside the navigation Stack content, so the basic architecture intends it to remain above scrolling content. However, the header behavior is not implemented as a reusable shared header component and must be validated consistently across tabs, detail pages, account pages and checkout/payment screens.

**Decision:**
- Keep one centralized customer header.
- Header remains fixed while screen content scrolls.
- Header must be safe-area aware.
- Content must never scroll underneath the header.
- Back navigation, brand and delivery-address area must use the same header implementation.
- Do not solve individual screens with custom header offsets.

### UX-02 — Bottom footer/tab navigation
**Status:** Needs correction

The bottom Tabs navigator exists, but it is only present inside the `(tabs)` route group. Detail/account/checkout flows do not have the same persistent bottom navigation behavior. At the same time, the shared `Screen` component always reserves bottom tab-bar space even on screens where the tab bar is not rendered.

**Decision:**
- Define the intended customer navigation shell centrally.
- Bottom navigation must remain fixed for customer root navigation where it is part of the customer shell.
- It must be safe-area/navigation-bar aware.
- Active/inactive states, icon sizes, labels and cart badge must be consistent.
- Screens without the bottom bar must not reserve artificial tab-bar whitespace.
- Content must never be hidden behind the bottom bar.

### UX-03 — Status bar / safe-area spacing
**Status:** Needs standardization

The customer header handles the top inset, but safe-area handling is distributed between layouts and the generic `Screen` component. Authentication and non-header screens use independent hard-coded top padding. This can create inconsistent vertical spacing between devices/notches/status-bar configurations.

**Decision:**
- Safe-area handling is centralized by shell/component responsibility.
- Status-bar inset must not be solved by arbitrary per-screen padding.
- Header owns top safe-area spacing when a header is displayed.
- Scrollable content owns only the spacing needed below the header.
- Authentication screens must use the same safe-area policy.
- Bottom inset must be applied exactly once.

### UX-04 — Button implementation inconsistency
**Status:** Confirmed gap

A shared `Button` exists, but many screens still implement buttons directly with custom `Pressable` styling. The existing Phase 8 MD also requires a dedicated native surface + interaction layer pattern, while the current shared Button renders the visual surface directly on `Pressable`.

**Decision:**
- One shared Button implementation is the default for all standard actions.
- Standard Button must provide consistent geometry, typography, alignment, loading, disabled and pressed states.
- The approved Android-safe pattern is a dedicated visual `View` with a full-size interaction layer.
- Screen-specific standard-button styling is prohibited.
- Icon-only actions must use the shared icon-button component or an approved equivalent.
- Minimum practical touch target is 44dp.

### UX-05 — Custom Pressable actions
**Status:** Confirmed gap

Addresses, subscription actions, product selectors, cart controls and other screens contain multiple custom Pressable controls with different heights, padding, borders and interaction behavior.

**Decision:**
- Audit every interactive control.
- Convert repeated standard actions to shared components.
- Keep genuinely specialized controls (calendar cells, product quantity controls, selectors) as dedicated components with standardized tokens and touch targets.

### UX-06 — Screen spacing / design-token usage
**Status:** Confirmed gap

The shared design tokens exist, but several screens still contain arbitrary inline values for margins, padding, heights and radii.

**Decision:**
- Prefer shared spacing/radius/typography/layout tokens.
- Inline values are allowed only where the value is part of a specialized component's intentional geometry.
- Avoid visually inconsistent 9/10/11/13/14/15px-style one-off values for equivalent controls.

### UX-07 — Scroll content and fixed chrome
**Status:** Confirmed gap

The generic `Screen` adds bottom space equivalent to the tab bar for every scrollable screen, including screens that do not render the tab bar.

**Decision:**
- `Screen` must not blindly reserve tab-bar height.
- Navigation shell determines whether bottom chrome is present.
- Scroll content receives the correct bottom inset exactly once.
- Long forms and checkout content must remain reachable above fixed navigation.

### UX-08 — Forms / keyboard behavior
**Status:** Needs validation and standardization

Long forms such as address/profile/auth flows use normal ScrollView layouts but do not have a single shared keyboard-aware form pattern.

**Decision:**
- Inputs must remain visible while the keyboard is open.
- Long forms must scroll to focused fields when required.
- Keyboard dismissal and submit behavior must be consistent.
- Avoid screen-specific keyboard hacks.

### UX-09 — Loading / empty / error states
**Status:** Needs standardization

Loading, empty and error states are implemented in multiple styles across screens.

**Decision:**
- Use shared Loader, EmptyState and ErrorState patterns.
- Retry actions must use the shared Button.
- State messages must have consistent spacing and hierarchy.
- Avoid raw `ActivityIndicator` + ad-hoc text combinations when a shared state component applies.

### UX-10 — Modals / selectors
**Status:** Needs standardization

Product/cart selectors and account modals use screen-specific modal/backdrop/card styling.

**Decision:**
- Standard modal backdrop, card spacing, close behavior and safe-area handling.
- Selector rows must have consistent touch targets and selected-state presentation.
- Specialized modals may retain unique content but not duplicate shell styling.

### UX-11 — Subscription screen UX
**Status:** Confirmed functional + UX gap

The current Subscription management screen still renders **Available plans** and includes a free-text start date. This conflicts with the approved flow.

**Decision:**
- Subscription management shows the customer's existing subscriptions only.
- Available subscription plans are selected from Product Detail.
- Product Detail is responsible for product-specific plan selection.
- Start date selection must be a controlled date-selection UI, not arbitrary text input.
- Saturday validation must be enforced against the selected start date.

### UX-12 — Accessibility / touch targets
**Status:** Needs systematic validation

Some Pressables use small custom dimensions while shared icon/button components provide larger targets.

**Decision:**
- Interactive controls should provide a minimum 44dp practical touch target.
- Accessibility role/label/state must be supplied for icon-only and important controls.
- Do not reduce visual size by reducing the actual touch target.

## 3. Priority

### P0 — Before further feature development
- Header/fixed-shell behavior validation
- Bottom navigation/shell behavior
- Safe-area/status-bar policy
- Shared Button implementation correction
- Correct Screen bottom-spacing behavior

### P1 — During UX correction phase
- Replace repeated custom standard buttons
- Standardize spacing/tokens
- Standardize loading/empty/error states
- Standardize modal/selectors
- Keyboard-aware forms
- Subscription screen UX correction

### P2 — Validation
- Accessibility/touch-target pass
- Android physical-device verification
- Small/large screen verification
- Scroll and keyboard regression

## 4. Non-Goals

This audit does not authorize changes to:

- Authentication architecture
- OTP rules
- Firebase identity model
- Payment architecture
- Cashfree lifecycle
- Inventory rules
- Order rules
- Subscription business rules except the already-approved subscription UI flow
- Delivery/business calculations
- Firestore architecture
- Firebase Functions

## 5. Development Workflow

The required sequence is:

```text
UX audit
  ↓
MD update / approval
  ↓
Shared UX implementation
  ↓
Screen migration
  ↓
Typecheck / build
  ↓
Android device validation
  ↓
UX regression
  ↓
Freeze UX baseline
  ↓
Continue remaining Mobile functional corrections
```

## 6. Implementation Result

Implemented in the Mobile UAT-4 baseline:
- Customer header is fixed above the Stack content and remains safe-area aware.
- Screen bottom padding now distinguishes tab screens from non-tab screens; non-tab screens no longer reserve false footer space.
- Authentication screens receive top safe-area spacing without duplicating the authenticated customer header inset.
- Bottom tabs were normalized for safe-area padding, icon/label spacing and cart icon positioning.
- ~~Shared Button now uses a dedicated visual surface plus full-size native interaction layer with consistent 44dp+ touch geometry.~~ **Status correction (2026-10-09): not implemented in the audited source** — Button rendered its surface through a function-valued `Pressable.style` that NativeWind discarded, with no vertical centering. Tracked in `docs/PHASE-8-UI-UX-STANDARDIZATION.md` §16.
- Standard quantity/add controls were raised to practical 44dp touch targets.
- Subscription management now shows existing subscriptions only.
- Product Detail now provides controlled Saturday start-date selection for subscriptions and preserves the selected date in the subscription cart.
- Subscription plan/product ownership is validated before subscription order creation.
- Checkout now applies the configured customer offer engine and uses the discounted total for payment.
- High-demand and delivery-shortage customer-contact flows no longer create orders or payment attempts when the customer chooses enquiry/contact.
- A checkout race that detects shortage during final order creation now fails safely instead of creating a contact-required paid order.

## 6. Completion Criteria

The UX correction phase is complete only when:

- Header remains fixed and safe-area correct across customer flows.
- Bottom navigation behaves consistently and does not create false whitespace.
- Status-bar spacing is consistent.
- Standard buttons use the shared implementation.
- Repeated custom standard buttons are removed or intentionally justified.
- Screen spacing uses shared tokens consistently.
- Loading/empty/error states are standardized.
- Modals/selectors follow a shared shell pattern.
- Keyboard/form behavior is validated.
- Subscription management no longer exposes available plans.
- Physical Android validation confirms scrolling, fixed chrome, touch areas and safe areas.
- MD/changelog are updated before the next development phase.


## 7. Locked UAT-5 correction requirements — MD-first, implementation pending

This section supersedes any earlier status in this document that says the affected UX is complete. The uploaded UAT-4 source was re-audited on 2026-10-09 and still exhibits regressions. Do not mark these items implemented until source and runtime verification pass.

### UAT5-01 — Shared Button alignment and touch surface
- Preserve the existing green button background and horizontally centered label.
- Center label and loading indicator vertically and horizontally within the visual button bounds.
- The whole visible button rectangle must respond to a press, not only the text glyphs.
- Fix the canonical shared Button and migrate standard actions to it; do not add screen-specific offsets or duplicate Button implementations.
- Validate on Android native and Expo Web.

### UAT5-02 — Unwanted white warning/notification bar
- Trace the exact component and trigger responsible for the recurring white bar with yellow warning icon and close control visible on Home, Delivery Calendar and Account screenshots.
- Do not remove all notification/error reporting blindly. Remove or correct only the unwanted persistent/empty overlay; genuine OTP, payment, order and validation errors must remain readable and accessible.
- Ensure no blank white toast is rendered when message content is empty. Ensure dismissal and timeout lifecycle are correct and that the overlay does not cover bottom navigation or page content.
- Record the owning component and regression test after source tracing.

### UAT5-03 — Checkout presentation lock
- `docs/PHASE-6-CHECKOUT.md` is the canonical presentation requirement. Its locked section supersedes all earlier checkout presentation wording.
- Match the latest approved Website checkout: purchase rows show product, packaging, quantity, payable selling price and resolved delivery date; summary shows product subtotal after offers, non-duplicated applicable offer savings, one delivery-charge row and grand total.
- Do not restore a separate MRP total or duplicate savings rows unless the latest approved Website source explicitly displays those same rows.
- Preserve the underlying offer calculation, delivery-charge unique-date calculation, payable amount sent to payment/order creation, inventory rules and Cashfree lifecycle. This is a presentation correction, not permission to rewrite business calculations.
- Before implementation, compare against the current approved Website source and update this MD first if that source contradicts the stated presentation. Do not treat older Mobile source/screenshots as authority.

### UAT5-04 — Reschedule-only delivery changes
- Reschedule Delivery is supported for eligible future deliveries.
- Skip Delivery is removed from the customer product. Do not render it, expose a service action for it, invoke it, or add it back from historical docs.
- Calendar states are Upcoming, Actual/Delivered, and Rescheduled as applicable. Do not introduce a customer Skipped state for new actions. Historical stored records may still need safe display if they already exist, but must not create a new skip path.
- Keep server-side ownership, active/paid subscription, date, schedule and delivery-state validation for reschedule.

### UAT5-05 — Regression-prevention gates
- Update MD first; then implement; then update changelog.
- Before marking complete, run a repository-wide search for `Skip Delivery`, skip action types/handlers, duplicate Button implementations and stale checkout MRP summary rows. Any match must be reviewed and explicitly classified as historical/audit-only or active code; do not leave contradictory normative instructions.
- Add automated architecture/regression checks where feasible for: no active Skip Delivery UI/action, checkout presentation contract, shared Button usage/geometry, and no empty notification toast.
- Run `npm run check:architecture`, `npx tsc --noEmit` (if supported by the project scripts), and `npx expo run:android`/Android build. Report checks honestly; a ZIP integrity check is not a build test.
- Only after checks pass may UAT5 be marked implemented. Physical-device verification remains a separate explicit gate.
