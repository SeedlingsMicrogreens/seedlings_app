# Changelog

## 2026-10-14 — Notification bell in the customer header
- Updated Phase 12 and CURRENT-STATE before implementation. Added a header bell immediately before the delivery-address/Pincode section, using the existing real-time Firestore notification subscription and read/unread model.
- Badge hides for zero/loading/fetch-error states, shows the unread count up to 99 and `99+` above that, and routes to the existing Notifications screen. The existing delivery-address/Pincode content and behavior were left intact.
- Added regressions for read-status changes, zero/unavailable counts, counts above 99, and Notifications route targeting. `npm run typecheck`, `npm run test:regression` (42 tests), `npm run check:architecture`, and `git diff --check` passed. No device rendering, commit, or deployment.

## 2026-10-14 — Floating Cart action on Product Details
- Updated the Phase 3 specification before implementation. Added a bottom-right floating Cart icon/button to Product Details, positioned above the bottom safe area with scroll-end clearance.
- The badge reads shared Zustand cart state through existing `getCartItemCount` semantics across one-time and subscription quantities, displays `0` when empty, caps visual count at `99+`, and updates reactively without a separate counter.
- Reused the existing Cart route via a shared route constant. No cart data, pricing, packaging, checkout, or payment behavior changed.
- Added regressions for empty/add/change/remove count behavior across purchase types and the target route. Validation passed: typecheck; regression suite (40 tests, 0 failures); architecture check; `git diff --check`.
- Android device `e67876c5` is connected, but the Product Details screen was not rendered or visually inspected. No commit or deployment.

## 2026-10-14 — Align Checkout delivery charge row
- Updated the Phase 6 spec first, then placed the delivery charge label and amount on the same row and kept the existing date breakdown directly below.
- Preserved the conditional original-price strikethrough and green discounted amount only for an applied delivery saving; no pricing or delivery calculation changed.
- Validation passed: `npm run typecheck`; `npm run test:regression`; `npm run check:architecture`; `git diff --check`. No Android rendering, commit, or deployment.

## 2026-10-13 — Checkout payable subtotal and mixed delivery offers
- Reconciled Mobile Checkout with Website `components/CheckoutHydrator.tsx` and `lib/checkoutPricing.ts`; documented the verified amounts and boundaries in the Phase 6 checkout specification before code changes.
- Product subtotal now uses a shared payable-product helper that also feeds the final total, deducting only the applied price-offer savings. MRP/reference savings remain informational.
- Corrected Mobile's mixed/subscription cart delivery-offer suppression to evaluate the delivery offer against the existing charged unique-date amounts, as Website does. Delivery breakdown groups actual charged dates by one-time purchase then subscriptions; original/final amounts are shown as a discount only when the applied offer result has positive savings.
- Added regressions for ₹480 MRP → ₹400 selling price → ₹390 after offer, mixed delivery charges ₹176 → ₹116, unique-date grouping, no applied delivery offer, and unchanged MRP treatment.
- Validation passed: `npm run typecheck`; `npm run test:regression` (38 tests, 0 failures); `npm run check:architecture`; `git diff --check`. No runtime/device checkout was performed; no commit or deployment.

## 2026-10-14 — Website Checkout row presentation parity
- Rechecked Website `components/CheckoutHydrator.tsx`, `lib/checkoutPricing.ts`, and `app/globals.css`; updated the Mobile Phase 6 specification before changing application code.
- Matched the Website's Subscriptions-before-One-time section order, product-and-quantity row title, subscription delivery-count text, two-decimal `en-IN` currency formatting, delivery-charge detail placement, and order of delivery followed by separate savings sections.
- Kept the selected plan reference, existing offer allocation/eligibility, unique-date delivery calculation, savings categories, and payable-total logic unchanged. No Website files, `.env.local`, authentication, cart, checkout validation, or payment behavior were changed for this presentation update.
- Added a regression for Website currency precision. Validation passed: `npm run typecheck`; `npm run test:regression` (35 tests, 0 failures); `npm run check:architecture`; `git diff --check`.
- Android device `e67876c5` is connected, but the Checkout screen was not rendered or visually compared because a safe authenticated test-cart state was unavailable. No commit or deployment was performed.

## 2026-10-13 — Checkout Website savings presentation (MD-first)
- Inspected Website `components/CheckoutHydrator.tsx`, `lib/checkoutPricing.ts`, and `app/globals.css` in the read-only Website workspace. Verified product, delivery, subscription-plan, and combined-savings groupings and confirmed only applied offers reduce Website payable total.
- Updated the Mobile Phase 6 specification to adopt the verified Website data presentation, distinguish savings sources, prevent duplicate aggregation, and preserve Mobile's existing payable calculation and currency convention.
- Mobile Checkout now presents the selected price offer with one-time MRP savings and separate component detail, separate delivery and subscription-plan savings cards, valid struck-through references, and a combined total using the verified non-overlapping categories.
- Added Website-derived breakdown regressions including invalid inputs and missing subscription reference; removed the one-time Product-price fallback for a missing subscription plan reference. The checkout payable function and offer selection/calculations were not changed.
- Validation passed: `npm run typecheck`; `npm run test:regression` (34 tests, 0 failures); `npm run check:architecture`; `git diff --check`. The connected Android device was not used to render/compare Checkout, and live offers were not verified. No Website files were modified.

## 2026-10-13 — Product Details purchase options and Cart navigation (MD-first)
- Approved flag-independent purchase availability: one-time options use valid active selling options; subscriptions use active valid plans whose `salableProductId` matches the current Product. Legacy product eligibility flags must not gate either option.
- Approved subscription reference pricing from the selected plan selling option's `maximumPlanPrice` only, never the one-time Product price/MRP. Added Add to Cart requirements for selected mode/package, duplicate-tap prevention, success-only Cart navigation, retryable failure, and existing quantity-based badge count.
- Removed Product Details purchase-eligibility flag gates; active associated subscription plans now control subscription visibility. Checkout revalidates exact plan ownership and no longer rejects one-time orders solely because of the legacy one-time flag.
- Subscription discounts use only valid `maximumPlanPrice` data. Add to Cart now persists the selected mode/package before state update, increments existing quantity, prevents repeat taps, reports write failures with retry, and navigates to Cart only after success. Cart badge count uses the existing total-quantity convention.
- Validation passed: `npm run typecheck` (0 diagnostics), `npm run test:regression` (31 tests), `npm run check:architecture`, and `git diff --check`. Android runtime and live Firebase plan data were not tested.

## 2026-10-13 — Product Details subscription discovery
- Fixed silent plan-load failures being converted to an empty list, which made an eligible Product appear to have no subscription options. Product Details now shows loading, confirmed-empty, ready, and retryable error states; route changes clear stale product/plan data.
- Kept the Website `salableProductId` association and product eligibility rules. If the exact query finds no valid plans, a fallback active-plan read filters by trimmed exact `salableProductId`; it does not use legacy `productId` aliases or expose another Product's plans.
- Shared subscription selling-option resolution now matches selected packaging weight first and then falls back to a trimmed selling-option ID, as documented by Website parity rules. Base plan price is allowed only when no package is selected; unmatched selected packages remain unavailable and invalid option prices are not displayed.
- Reused the same validated option resolver when changing packaging on an existing subscription cart line; active plans without a finite, non-negative base price are excluded.
- Regression suite passed (27 tests), `npm run typecheck` passed (0 diagnostics), `npm run check:architecture` passed, and `git diff --check` passed. No live Firebase Product/plan records or Android runtime were available to verify the specific reported Products.

## 2026-10-13 — Product listing, Cart, and checkout pricing parity
- Compared Mobile pricing and checkout calculations with the copied Website parity reference and read-only Website source. Product listing and Cart price displays already matched their respective Website rules; no UI or product-list code change was required.
- Corrected unified Cart savings to total per line, preventing non-discounted/lower-reference items from offsetting valid quantity-scaled savings.
- Corrected checkout delivery-offer eligibility: flat savings apply once against the aggregate eligible delivery amount, and delivery offers are not applied when subscriptions are present. Price-offer distribution and subscription bonus entitlements are unchanged.
- Added regression coverage for mixed discounted/non-discounted Cart lines, best price/delivery offer selection, flat and percentage delivery savings, subscription/mixed-cart delivery-offer suppression, and final payable totals.
- Validation passed: `npm run typecheck` (0 diagnostics), `npm run test:regression` (24 tests), `npm run check:architecture`, and `git diff --check`. `package.json` has no standalone lint or build script. Android runtime behavior was not tested.
- No Website code or payment flow was changed. No commit or deployment was performed.

## 2026-10-13 — Phase 1 Firebase and Android UAT attempt
- Re-ran `npm run typecheck` (passed, 0 diagnostics), `npm run test:regression` (passed, 21 tests), `npm run check:architecture` (passed), and `git diff --check` (passed).
- Firebase enquiry tests A/B could not run because no authenticated approved Firebase test project/emulator is configured in the Mobile workspace. Android UAT tests A–E could not run because there is no connected adb device and no emulator executable.
- Updated the remediation plan and current state to enumerate each blocked scenario and the exact environment/access needed. Phase 1 remains **BLOCKED**; automated tests are not treated as live UAT evidence.
- No application code changed for this UAT attempt. Payment, Phases 2–3, Website source, `.env.local`, commits, pushes, and deployments were untouched.
- A subsequent runtime-only verification pass confirmed the same prerequisites remain unavailable. No Firebase/Android scenario was rerun and no application code was changed.

## 2026-10-13 — Phase 1 closure validation
- Resolved the 31 baseline TypeScript diagnostics with narrow type-safe corrections: typed Cart card inputs and branches, guarded optional address/price values, used modular Firebase custom-token sign-in on native, added persisted `cartPosition` to its data contract, narrowed Firestore sales-product components/fields, and used the selling-option ID exposed by the subscription resolver.
- Re-ran validation: `npm run typecheck` passed with 0 diagnostics; `npm run test:regression` passed (21 tests); `npm run check:architecture` passed; `git diff --check` passed.
- Source review and existing regression coverage confirm stable checkout-attempt identity/recovery paths and enquiry save-before-removal behavior. No payment process was tested.
- Firebase persistence and Android UI validation could not be performed: no connected adb device or emulator binary; no Firebase project/emulator configuration in the Mobile repository, and no Firebase variables in the current process. `.env.local` was neither inspected nor modified.
- Phase 1 remains **blocked**, not complete, until the approved Firebase persistence/retry and Android popup/cart-state UAT is performed. No Website, payment, Phase 2/3, commit, push, or deployment work was performed.

## 2026-10-13 — Phase 1 closure validation preparation (MD-first)
- Recorded the approved closure scope: resolve the current TypeScript diagnostics with narrow type-safe corrections, verify non-payment checkout duplicate protection, unserviceable-pincode enquiry and shortage Yes/No outcomes, and run the required automated checks.
- Explicitly require actual configured Firebase and Android runtime verification where an approved environment is available; mocks are not sufficient evidence. If unavailable, Phase 1 remains blocked.
- Payment, Phases 2–3, Website source, build settings, and unrelated behavior remain excluded.
- No application source changed in this preparation step.

## 2026-10-13 — Non-payment parity follow-up scope (MD-first)
- Recorded the approved follow-up boundary: non-payment checkout duplicate-validation protection, actionable unserviceable-pincode enquiry, ownership safeguards, and shortage confirmation through the Website-aligned Yes/No decision.
- Documented that No must save each affected later-date enquiry before removing only that item, preserve unaffected on-time cart entries, and return to Cart when none remain; write failures remain visible and retain unsaved cart items.
- Explicitly excluded Cashfree/payment flows and UAT, wider Phase 2 subscription work, and wider Phase 3 high-demand/availability changes.
- Captured the current 31 TypeScript diagnostic baseline and root-cause categories before implementation; unrelated typing cleanup is out of scope.
- No application code changed in this documentation-first preparation step.

## 2026-10-13 — Shortage confirmation and enquiry retry safeguards
- On the date-change popup's No branch, save a deterministic enquiry for each affected later-date item and remove that item only after the write succeeds or an exact matching read-back confirms persistence. Enquiry failure is shown and the unsaved item remains in the cart.
- Preserve unaffected on-time cart entries and return to Cart after successful decline handling; the customer can continue with remaining items, and an all-declined cart is empty on Cart. Yes retains the accepted dates and existing revalidation.
- Tightened uncertain unserviceable-pincode enquiry confirmation to require the same authenticated owner, pincode, address ID, and item payload. Added stable per-item declined-availability enquiry identity and regression coverage for save/remove ordering, failure handling, and unaffected items.
- Validation: 21 regression tests passed; `npm run check:architecture` and `git diff --check` passed. `npm run typecheck` remains failed with the 31 baseline diagnostics documented in the remediation plan; no new diagnostics point to this change. Firebase persistence and Android UI behavior remain unverified.
- No Cashfree, payment retry/recovery/return/webhook/session/UAT, Phase 2, or broader Phase 3 implementation was performed.

## 2026-10-13 — Phase 1 checkout safety and pincode enquiry implementation
- Added a deterministic signed-in-customer/cart-fingerprint checkout identity and order/subscription document IDs. Pending records are written in one atomic Firestore batch with merge semantics; an ambiguous or conflicting result recovers only a complete set matching the authenticated customer, attempt ID, and cart fingerprint. Same-intent retries preserve server-written Cashfree fields.
- Revalidates pending order and linked subscription ownership against the active Firebase auth UID and customer mobile before payment. A saved attempt with a different or legacy-unmatched cart fingerprint requires explicit confirmation before resuming. Order-detail payment retry also blocks when the saved order auth UID differs from the signed-in user. Known Cashfree attempts are verified before retry; payment status reconciliation, existing server-side session reuse/finalization, and inventory lifecycle are preserved.
- Added typed unserviceable-pincode handling and an explicit delivery enquiry action. It writes a deterministic customer/pincode/address enquiry with create-only semantics, confirms ambiguous/duplicate results by reading the exact document, surfaces failures for retry, and blocks checkout/payment for unserviceable addresses.
- Regression suite coverage includes stable checkout IDs/fingerprints, pincode enquiry identity, and typed unserviceable status.
- Validation: `npm run test:regression` passed (18 tests); `npm run check:architecture` passed; `git diff --check` passed. `npm run typecheck` failed with 31 diagnostics in pre-existing code across seven files; see `docs/WEBSITE-MOBILE-PARITY-REMEDIATION-PLAN.md` for the grouped exact outcome. The former order-detail `deliveryDate` and test-fixture errors are corrected. Firebase/Cashfree/device UAT remains outstanding, so Phase 1 is not yet verified complete.
- The inspected Website UAT Firestore rules authorize reads only of owned existing documents and do not expose a client checkout-claim collection. The Mobile implementation uses deterministic identity, atomic batch writes and recovery rather than a transaction that reads absent documents. A customer-wide lock across distinct simultaneous cart fingerprints remains outside the approved Mobile-only boundary. No Website repository, rules/config, Phase 2/3 behavior, `.env.local`, or unrelated working-tree changes were modified. No commit or deployment was performed.

## 2026-10-13 — Phase 1 implementation design (MD-first)
- Recorded the pre-code design for durable payment-attempt recovery, deterministic order/subscription document paths, retry-safe Firestore batch writes, Cashfree verification/session reuse, and a create-only idempotent unserviceable-pincode enquiry.
- Inspected the Mobile repository and current Website Firestore rule/payment contracts. The Mobile repository has no Firestore rules/config; current rules do not expose a client checkout-claim collection, so cross-device simultaneous new checkouts remain an explicit boundary limitation.
- No application source changed in this design step. Implementation must stop if it requires a Website/rules/backend scope expansion.

## 2026-10-13 — Parity decisions and Phase 1 scope (MD-first)
- Updated the remediation plan with the confirmed high-demand sequence: check the requested date, then the Website Cart's one subsequent Saturday; if that later date also exceeds the existing threshold, offer enquiry only and stop.
- Recorded Website-confirmed changed-date decline behavior: save an enquiry for explicitly declined later-date items, remove those items only after No/Send Enquiry consent, and allow unaffected on-time items to continue only when any remain. Yes accepts the displayed dates and still requires final availability/payment validation.
- Restricted Phase 1 to checkout idempotency/recovery and unserviceable-pincode enquiry. Subscription correctness and shortage-flow changes remain deferred to their later phases.
- Added Phase 1 boundaries and criteria for existing Firebase/Firestore architecture, payment recovery, and inventory invariants without selecting an implementation mechanism before Firestore rules and data contracts are inspected.
- Updated `CURRENT-STATE.md`; no application source, parity reference, build, test, deployment, or commit was changed/performed.

## 2026-10-13 — Website–Mobile parity remediation plan (MD-first)
- Consolidated the two read-only parity analyses into `docs/WEBSITE-MOBILE-PARITY-REMEDIATION-PLAN.md`, merging checkout idempotency, duplicate-order, interrupted-recovery, and retry concerns into one issue.
- Recorded nine unique gaps with source evidence, classifications, impacts, dependencies, recommended corrections, acceptance criteria, regression scenarios, and phase-specific validation.
- Organized work into Phase 1 checkout safety/enquiry, Phase 2 subscription correctness, and Phase 3 shortage/availability; idempotency is scoped only to Phase 1.
- Preserved existing Mobile threshold and decline rules pending owner decisions where they conflict with current Website Cart behavior.
- Recorded the Website parity reference’s subscription-price-reference conflict against current Website Product Details source; no presentation gap was inferred where current Mobile already matches Website source.
- Updated `CURRENT-STATE.md`. Documentation-only preparation; no application source, build, test, deployment, or commit was changed/performed.

## 2026-10-13 — Product Details selling-option price display (MD-first)
- Updated the Phase 3 Product Details requirement with the requested name/description and discounted price visual hierarchy for one-time and subscription purchase options.
- Verified the Website field meanings: one-time `mrp`/`price`, and subscription matched `planPrice` compared with the selected selling option's one-time `price`.
- Added crossed-out original/reference prices and savings to discounted purchase options; current prices are displayed in green for both purchase modes.
- Fixed subscription option matching to try the selected selling-option ID first and matching weight second, so the existing configured `planPrice` resolves when Website-equivalent option IDs differ.
- Preserved price calculation semantics, purchase selection and cart behavior; added regression coverage for weight-matched and unmatched options.
- Updated `CURRENT-STATE.md` and the Phase 3 implementation status.
- Regression tests passed; Android build/install/open succeeded, but discounted subscription rendering was not confirmed on-device because the connected device became unavailable.

## 2026-10-13 — Home order-block removal (MD-first)
- Updated the Phase 2 Home specification to remove the One Time and Subscriptions promotional blocks from the Home screen only.
- Recorded that product discovery, navigation tabs, and existing one-time ordering and subscription functionality must remain unchanged.
- Added `CURRENT-STATE.md` to track the requested Home presentation change.
- Removed only the One Time and Subscriptions promotional blocks and their now-unused styles from the Home screen. Existing ordering and subscription functionality and all other Home content remain unchanged.

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
