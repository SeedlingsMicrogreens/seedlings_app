# Changelog

## 2026-10-09 — UI Baseline implementation (Batches 1–5)
- Removed NativeWind/Tailwind (config, CSS, type declarations, `nativewind` and `tailwindcss` packages). React Native `StyleSheet` + `constants/theme.ts` + shared components are the only styling approach. Reanimated/Worklets unchanged.
- Shared `Button` rebuilt as an outer `View` surface + inner full-size `Pressable` with static geometry, 50dp height and centered content; caller `style` applies to the outer surface. Verified on a physical Android device (render, centering, four-corner taps); disabled/loading not runtime-verified.
- Fixed root-tab back-arrow detection, Cart tab label overlap, double bottom padding on tab screens, Account header workaround, safe-area toasts, Notifications scrolling, keyboard reachability on Android edge-to-edge, Search bar double border.
- Added shared `BottomSheet`, `SelectSheet`, `SelectField`, `OptionCard`, `QuantityStepper`, `TextAction`, `LoadingState`, `ErrorState`, `Toast`, multiline `AppInput`, and theme tokens; migrated all audited routes to them and to `StyleSheet`.
- No change to services, store, Firebase, authentication/OTP, cart/checkout calculations, offers, delivery charges, orders, Cashfree, subscriptions, addresses, calendar rules or feedback submission. Details and verification status: `docs/UI-BASELINE-IMPLEMENTATION-REPORT.md`.

## 2026-10-09 — UI Baseline: documentation correction (Batch 0)
- Added the mandatory "Mobile UI Standard" to `DEVELOPMENT-RULES.md` and the UI baseline plan/status tracker to `docs/PHASE-8-UI-UX-STANDARDIZATION.md` §16. Approved styling: React Native `StyleSheet` + `constants/theme.ts` tokens + shared components; NativeWind/Tailwind not approved.
- **Status correction:** the earlier Button entries below ("UAT-5 … full button surface is now the Pressable touch target … vertically and horizontally centered", "UAT-4 … dedicated visual surface and full-size interaction layer", "2026-10-08 … Pressable owns the complete button geometry … centrally centered") were **not reflected in the audited source**. The source used a function-valued `Pressable.style`, which NativeWind's JSX runtime discarded, and `styles.button` had no vertical centering. These entries are historical claims, not implemented behavior. See PHASE-8 §16.1.
- Policy conflict recorded as **Requires owner decision**: subscription Pause/Cancel (BASELINE prohibits; PHASE-9 and source allow). Runtime behavior unchanged.

## UAT-5 implementation — locked Mobile baseline
- Button: the full button surface is now the Pressable touch target; label/loading indicator are vertically and horizontally centered. Existing green styling is preserved.
- Checkout: removed the standalone MRP summary and duplicated savings rows/banner. Product subtotal, offer savings, delivery charges, unique delivery-date calculation, and final total calculations remain unchanged.
- Delivery calendar: removed Skip Delivery control and skip action from the customer UI/service action type. Reschedule Delivery remains supported. Historical skipped delivery records may still appear as historical data; customers cannot initiate a skip.
- Root notification display: ignore empty foreground push notifications so they cannot create an empty toast. Valid foreground notifications remain visible.
- Authentication, server-controlled demo/real OTP, Firebase Custom Token sign-in, customer identity, order creation, and Cashfree lifecycle are unchanged.

- Added explicit locked requirements for shared Button vertical/horizontal centering and full-surface touch behavior.
- Added investigation and acceptance criteria for the recurring white warning/notification overlay, including preventing empty toasts without suppressing real errors.
- Replaced checkout presentation instructions with the current Website-aligned layout contract; no separate MRP summary or duplicated savings rows unless explicitly present in the approved Website checkout. Existing totals/offer/delivery/payment rules remain unchanged.
- Removed Skip Delivery from current Phase 10 scope and all normative delivery-action guidance; Reschedule Delivery is the only supported customer delivery-change action.
- Clarified that earlier implementation-status entries are historical and do not override the UAT-5 acceptance gates.
- Added regression-prevention checks and required honest typecheck/Android build reporting.
- MD-only update. No application source code changed in this archive.

## 2026-10-09 — UAT-4 UX + Functional Correction Implementation
- Implemented the approved UX audit baseline without changing the Firebase/Cashfree architecture.
- Customer header is fixed above scrolling content and is safe-area aware.
- Corrected Screen bottom spacing so only tab routes reserve bottom-tab space.
- Standardized top safe-area behavior for authenticated and unauthenticated customer screens.
- Normalized bottom tab bar spacing, icon positioning and cart presentation.
- Hardened the shared Button with a dedicated visual surface and full-size interaction layer; standard controls use practical 44dp+ touch targets.
- Removed the Available Plans marketplace from Subscription management; plan purchase remains on Product Detail.
- Added controlled Saturday subscription start-date selection on Product Detail and preserved the selected date through cart.
- Added subscription plan-to-product validation.
- Added Website-aligned customer offer calculation to Mobile checkout and payment total/order persistence.
- Added enquiry-only handling for high-demand and customer-declined delivery-date changes; these paths do not create orders or payments.
- Final mixed-checkout shortage validation now fails safely instead of creating a contact-required order.
- Updated the Cashfree alignment check to reflect the approved Subscription management flow.
- `npm run check:architecture` passed.
- Full dependency install/typecheck and physical Android validation remain pending because package installation timed out in the build environment.

## 2026-10-08 — UAT-3 MD Alignment
- Updated Mobile MDs to use the current Website customer flow as the behavioral reference.
- Added explicit subscription start-date selection requirements and clarified that Subscription management shows existing subscriptions only; available plans are selected from Product Detail.
- Aligned Mobile checkout documentation with current Website pricing/offer behavior rather than the older Mobile-only MRP summary.
- Documented cross-platform payment continuity: pending/failed Cashfree payments started on either Website or Mobile must be checkable/retryable from the other platform using the same persisted order/payment records.
- Aligned Mobile feedback documentation with the Website `orderFeedback` cross-platform data contract.
- Clarified shared Website + Mobile authentication using the same server 4-digit OTP API and Firebase customer identity.
- Added `docs/WEBSITE-MOBILE-SHARED-CUSTOMER-FLOW.md`.
- MD-only update; no source-code changes.

## 2026-10-08 — Final UAT 4-Digit Custom OTP Mobile Implementation
- Replaced Mobile Firebase Phone Authentication and fixed/local OTP handling with the approved server-controlled 4-digit OTP API contract.
- Added the Mobile authentication API client for send/resend and verify OTP.
- Added Firebase Custom Token sign-in for Web and native Firebase clients.
- Removed Mobile-side customer Firebase identity creation/update during OTP verification; customer/Firebase identity resolution is now server-authoritative.
- Updated OTP UI to exactly four cells and server-returned Demo OTP handling.
- Removed fixed OTP environment values from the Mobile example configuration.
- Updated the Mobile API-boundary architecture check to allow only the explicit authentication API exception.
- Website/server OTP endpoint implementation remains required before Real SMS UAT.

## 2026-10-08 — Final UAT Authentication Architecture (MD-only)
- Updated the authentication architecture documentation to define server-controlled 4-digit OTP authentication.
- Replaced the old fixed `1234` / Firebase Phone Authentication architecture in affected MDs with server OTP verification and Firebase Custom Token sign-in.
- Documented Demo OTP generation/display, Real SMS server integration, OTP expiry/invalidation/consumption, customer Firebase identity resolution, and the approved authentication API boundary.
- Documented the supplied SMS provider request shape using server-side placeholders only; no SMS secret was added to the Mobile project.
- No source code, dependency, environment configuration, payment, order, subscription, inventory, delivery, notification or feedback logic was changed.

- Fixed the remaining Phase 13 feedback-service stale `@react-native-firebase/storage` import that caused Metro Android bundling failure; feedback image upload/cleanup now uses the existing Firebase Web SDK Storage client.
# Changelog

## 2026-10-08 — Account UI/UX + Profile Photo Synchronization
- Reworked the shared `Button` surface so the native `Pressable` owns the complete button geometry and text/loading content is centrally centered on Android and iOS.
- Added reusable `ProfileAvatar`, `AccountMenuSection` and `AccountMenuItem` components.
- Rebuilt the Account tab using consistent iconography, row heights, touch targets, chevrons and grouped navigation sections.
- Profile photo loading now uses the customer Firestore `photoUrl` as the cross-platform source of truth and falls back to initials when the remote image is unavailable.
- Customer profile cache now retains `photoUrl`; Account/Profile render cached data immediately and reconcile it with a fresh Firestore read.
- Mobile profile photo upload/remove updates the local profile cache so Account/Profile stay synchronized.
- Removed the stale `@react-native-firebase/storage` dependency; Firebase Web SDK Storage remains the profile-photo implementation used by the existing Mobile architecture.
- No authentication, payment, order, subscription, delivery, notification or feedback business rules changed.

## 2026-10-08 — Phase 13 Feedback
- Added delivered-order feedback for one-time and subscription delivery orders.
- Added 1–5 star rating, optional comments, Packaging/Cleanliness/Freshness options and delivery-partner On time/Less calling options.
- Added up to 3 PNG/JPG/JPEG feedback photos with 5 MB per-image validation and Firebase Storage upload scoped to the authenticated UID.
- Added duplicate-feedback protection per delivered order and `Rate this order` entry from Order Details.
- Added Feedback to the customer Profile menu.
- Added Phase 13 documentation and storage-rule coverage.


- Added real-time customer notification center with unread state.
- Added mark-one-read and mark-all-read actions.
- Added notification deep links to orders/subscriptions.
- Added Android FCM token registration and token refresh using Firebase Auth UID/customer identity.
- Added foreground notification toast handling.
- Reused the existing Website notification/FCM contract; no new Website API and no Firebase Functions.



## Phase 10 — Delivery Calendar / Journey
- Added MD-first Phase 10 specification.
- [HISTORICAL — superseded by UAT-5] Earlier plan described Website-aligned delivery calendar, journey, skip and reschedule behavior. Current decision is reschedule-only.

## Phase 10 — Delivery Calendar / Journey implementation
- Added subscription delivery calendar with month navigation.
- Added actual delivery history from `subscriptionDeliveries`.
- Added virtual upcoming subscription deliveries based on the subscription schedule.
- Added delivery journey/progress and next-delivery summary.
- [HISTORICAL — superseded by UAT-5] Earlier implementation added authenticated Skip and Reschedule actions. Skip Delivery is now prohibited; Reschedule Delivery only is approved.
- Added Phase 10 API-boundary exception documentation.
- No Firebase Functions introduced.

## Phase 11 — Profile, Addresses & Profile Photo

- Added Phase 11 MD-first specification.
- Standardized profile form controls using shared UI components.
- Added authenticated profile photo select/upload/replace/remove flow.
- Profile photo is stored in Firebase Storage under the authenticated Firebase UID.
- Customer `photoUrl` is stored on the customer Firestore document.
- Profile tab now displays the stored profile photo when available.
- Existing address CRUD/default behavior preserved.
- Added Firebase Storage security rules for customer profile photos.
- No Firebase Functions or Website APIs introduced.

## Phase 11 — Android launch crash fix
- Replaced the profile-photo Storage implementation from `@react-native-firebase/storage` with the existing Firebase Web SDK Storage client.
- Removed the native Storage module from the Mobile dependency graph, eliminating the Android launch-crash surface introduced by the Phase 11 Storage integration.
- Profile photos continue to use `customer-profile/{authUid}/profile.jpg` and persist `photoUrl` on the customer document.
- No payment, order, subscription, or business logic changed.
## Phase 11 — Android startup crash fix

- Fixed confirmed Android startup crash caused by an Expo Modules Kotlin class missing from the `expo-image-picker` 17.x native package.
- Aligned `expo-image-picker` with Expo SDK 57 using `~57.0.20`.
- No Firebase/payment/order/subscription logic changed.
- Native Android rebuild is required after dependency alignment.


### Android build dependency stabilization
- Pinned transitive `@expo/ui` to `~57.0.21` to prevent Gradle resolving unavailable `expo.modules.ui:expo.modules.ui:57.0.19`.


## OTP network error handling
- Converts browser fetch/CORS and connectivity failures into actionable customer-facing messages.
- Keeps API-provided validation errors (including cooldown and invalid mobile) intact.
- Does not change the shared Website OTP API, server-controlled demo/real mode, or Firebase Custom Token sign-in flow.


## Account screen layout correction (UAT follow-up)
- Account menu rows explicitly prevent wrapping and reserve a fixed-width, vertically centered chevron area on the right.
- Added safe top spacing to the Account profile hero so the avatar is not clipped behind the fixed customer header when a previous scroll offset is restored.
- No OTP, Firebase identity, demo/real OTP, payment, or order behavior changed.
