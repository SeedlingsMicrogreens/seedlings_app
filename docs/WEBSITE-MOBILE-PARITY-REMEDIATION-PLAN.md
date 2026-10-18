# Website–Mobile Parity Remediation Plan

**Status:** The non-payment checkout/enquiry safeguards and approved shortage-confirmation decision slice are implemented. All 31 TypeScript diagnostics have been resolved with narrow type-safe fixes, and required automated checks pass. **Phase 1 closure remains blocked** because no approved Firebase runtime or Android device/emulator was available for required persistence and UI verification. Payment behavior and wider Phase 2/3 work remain explicitly excluded.
**Analysis basis:** Static inspection of the current Mobile source, current Website source, and the Mobile Website parity reference. This document records source-level findings only; it does not claim device, Firestore, Cashfree, or production verification.

## Purpose and boundaries

Consolidate the findings from the read-only Website–Mobile parity and shortage-flow analyses into one implementation plan. Preserve existing Mobile and Admin business rules, make only the scoped corrections approved by the owner, and keep all ordinary customer data and business logic on the existing Firebase/Firestore Mobile boundary.

Non-negotiable constraints:

- Do not add Website APIs or Firebase Functions for ordinary customer flows. Existing Cashfree payment APIs remain the payment exception.
- Do not change inventory lifecycle: cart/date-resolution work does not reserve or deduct stock; pending, failed, or abandoned payment is not committed demand; fulfilment packing consumes inventory.
- Never accept or create an order for a partial quantity.
- A decline must not create an order/payment for the declined item(s); enquiry writes are separate from order creation.
- Keep payment status server-authoritative and preserve the existing Cashfree recovery behavior.
- Avoid unrelated refactors. Follow `DEVELOPMENT-RULES.md` and update this plan/current-state documentation before implementation work in each phase.

## Current approved follow-up slice — non-payment through shortage confirmation

This follow-up is limited to customer behavior through the availability/date-change confirmation popup. It may correct the existing Mobile No branch so each declined later-date item is enquired about before that item is removed, unaffected on-time items remain available to continue, and an empty cart returns to Cart. Enquiry failure must be visible and must not remove the unsaved item or proceed. The Yes branch accepts the displayed complete-quantity delivery dates and revalidates through the existing checkout checks. Unserviceable-pincode enquiry must remain actionable, persistence-confirmed before success, and safely retryable. Existing synchronous checkout/availability guards must prevent duplicate non-payment validation/enquiry actions.

This slice does not implement Cashfree, payment-session creation/retry/recovery/webhooks/return behavior or payment UAT. It also does not implement the broader Phase 3 high-demand horizon, no-date consent redesign, last-moment availability policy changes, or any Phase 2 subscription price/date work. The current Website `lib/cartCheckoutDecisions.ts` and `components/CartPage.tsx` are the behavioral reference for date-change Yes/No item outcomes; Website code is read-only.

### Acceptance and validation for this slice

- Yes keeps the exact dates shown and continues only through existing validation; it does not accept partial quantities or silently change dates.
- No persists an enquiry for each item available only on the later date. Remove only an item whose enquiry is confirmed saved; preserve unaffected on-time items. If no cart items remain, return to Cart. Enquiry failure is explicit, and no unsaved item is removed.
- A retried uncertain enquiry write must not create a duplicate or report success based only on a different/stale request.
- An unserviceable pincode offers **Send delivery enquiry**, confirms an owned matching saved request before success, surfaces failures for retry, and remains ineligible for order creation.
- Automated regression tests cover stable declined-enquiry identity, save-before-remove ordering, enquiry failure stopping removal, preserving unaffected items, and related existing checkout regressions. They do not emulate Firestore persistence or Android dialogs. Run `npm run typecheck`, `npm run test:regression`, `npm run check:architecture`, and `git diff --check`.
- Firebase persistence and Android UI behavior are runtime-only and must be identified as unverified unless exercised. No payment testing is part of this follow-up.

### TypeScript baseline for this follow-up

The pre-implementation `npm run typecheck` run reported 31 diagnostics: Cart card implicit-any callbacks (3), optional address mobile dereference (1), optional subscription price values (2), instance-style custom-token sign-in API (1), undeclared persisted `cartPosition` (2), untyped sales-product fields/reducer values (19), and selling-option `id` accesses not present on the resolver result (3). These were verified in the fresh baseline run and corrected in the closure follow-up. The final project-wide typecheck now passes with zero diagnostics. No TypeScript suppressions, broad domain casts, or compiler-setting changes were introduced. The Product Details price display retains its existing zero fallback; no Phase 2 business rule was changed.

**Implementation result:** The checkout validation function retains its synchronous in-flight guard. On date-change **No**, Mobile resolves affected cart entries by their full checkout key, writes a stable per-attempt/per-item enquiry, confirms ambiguous retries against matching saved fields, and removes each affected item only after its enquiry is confirmed. A failed write leaves that item in Cart and surfaces through the existing checkout error; previously confirmed enquiries/removals remain complete and retryable. Unaffected on-time entries remain in Cart; after all affected enquiries save, Mobile routes to Cart (empty if all items were declined). **Yes** retains the displayed date choices and existing subsequent validation. Unserviceable-pincode enquiry retries confirm the saved pincode/address/item payload. Regression tests cover stable enquiry identity, save-before-remove/error ordering, and preserving unaffected entries.

**Closure validation result (re-run):** `npm run typecheck` passes (0 diagnostics); `npm run test:regression` passes (21 tests); `npm run check:architecture` passes; `git diff --check` passes. No live Firestore writes or Android UI were tested in this verification attempt: `adb devices` lists no device; the Android emulator command is unavailable; the Mobile repository has no Firebase emulator/project config (`firebase.json`, `.firebaserc`, or `firestore.rules`). Thus Firebase test A (successful enquiry document and payload verification) and test B (failed write, retry, and resulting document) are blocked. Android tests A–E (Yes, successful No, failed No, mixed cart, and all-items-affected) are all blocked. Required access is an approved Firebase test project with authorized customer credentials and an Android device/emulator configured with the app and that project. `.env.local` was not inspected or changed. The automated suite is not used as proof of these runtime scenarios. **Phase 1 is BLOCKED, not complete** until both Firebase tests and all five Android scenarios pass. No payment behavior/UAT, Phases 2–3, Website source, or unrelated work was changed in this verification attempt.

**Runtime-only verification retry (2026-10-13):** Re-read the required project rules and current closure state, then checked UAT prerequisites once. The environment remains unavailable (no connected Android device, no emulator executable, and no Firebase project configuration in this Mobile repository). No Firebase or Android scenario was retried, no source code was changed, and Phase 1 remains blocked for the exact Firebase Tests A/B and Android Tests A–E listed above.

### Phase 1 closure follow-up (MD-first)

Approved closure work is limited to the previously reported TypeScript diagnostics and the non-payment checkout duplicate guard, actionable unserviceable-pincode enquiry, and shortage popup Yes/No flow. Type corrections must preserve existing data and UI behavior: explicitly type cart-card props and callbacks; handle optional address mobile values safely; make subscription price display consume the resolver's optional result safely; use the Firebase modular custom-token sign-in API on native as well as web; include persisted `cartPosition` in its persisted-item type; give the legacy sales-product reads a concrete validated/narrow type; and use the resolved selling-option ID field already exposed by the subscription resolver. Do not change payment, Phase 2/3 business behavior, external APIs, TypeScript settings, or unrelated functionality.

Closure validation requires `npm run typecheck`, `npm run test:regression`, `npm run check:architecture`, and `git diff --check`; all now pass. Still outstanding: exercise duplicate same-intent submission without entering payment, successful and failed enquiry persistence, and shortage Yes/No cart outcomes on an approved Firebase test project and Android device/emulator. Unit tests or mocks alone are not evidence of Firebase persistence or Android behavior. No suitable Firebase/Android runtime was available for this run; Phase 1 remains blocked rather than complete.

## Current three-goal pricing and offers slice

This implementation slice is limited to product-list pricing display, Cart price display, and checkout offers/payable totals. Website source is read-only. The other six parity findings, payment lifecycle work, and unrelated business rules remain out of scope.

### Pre-implementation verification and approach

- Product listing must show the Website's product-level `sellingPrice` and `mrp`; add-to-cart continues to resolve the default active selling option. Confirm that both platforms conditionally show reference price/savings only when the reference is greater than the selling price.
- Cart displays the selected one-time selling-option price/MRP or subscription `planPrice`/`maximumPlanPrice`, with original price and savings scaled by quantity. Cart remains free of a delivery charge or order summary. Cart subtotal and savings helpers must sum line values without allowing one line's lower MRP to offset another line's valid savings.
- Checkout price offers apply to the combined one-time and subscription product subtotals. Delivery offers are applied only when the cart has no subscription; the Website does not discount delivery charges for subscription or mixed checkouts. For eligible one-time-only checkout, a flat delivery offer is capped once against the aggregate eligible delivery charge, not independently against each delivery date.
- Use the existing shared price-display and offer-calculation helpers; keep Checkout display and mixed-checkout order-record totals on the same offer result. Do not change payment processing or add a backend.
- Validation must cover discounted/equal/higher reference prices, quantity-scaled savings, mixed line savings, best offer eligibility, percentage and flat discounts, delivery-offer suppression for subscription/mixed carts, subscription bonus entitlements, delivery charges, and final payable total. Run the project typecheck, regression and architecture checks, and `git diff --check`; report Android runtime testing separately.

| Goal | Verified Website behavior | Current Mobile behavior and confirmed gap | Required Mobile change |
|---|---|---|---|
| Product listing | `components/CataloguePage.tsx` and `components/business/ProductCard.tsx` display product-level `sellingPrice` and `mrp`; show strikethrough MRP and savings only when MRP is greater. Add-to-cart independently resolves the default active selling option. | `components/UI.tsx` `ProductCard` displays `product.price`/`product.mrp`, derives the displayed weight from the default active option, and adds through the option-aware store action. The same conditional reference-price rule is used. No confirmed listing-pricing gap. | Preserve the existing listing and add-to-cart behavior; cover the shared strict comparison with regression tests. |
| Cart | `components/CartPage.tsx` uses one-time option price/MRP or subscription `planPrice`/`maximumPlanPrice`; `lib/priceDisplay.ts` shows the original and savings only when it is greater, scaled by quantity. Cart has no delivery charge or order summary. | `app/(customer)/(tabs)/cart.tsx` already displays selected-option prices, conditional reference prices and quantity-scaled savings. `getUnifiedCartTotals()` calculates subtotal correctly but derives aggregate savings by subtracting aggregate subtotals, allowing a non-discounted line to offset another line's savings. | Preserve the display and correct the shared totals helper to sum line-level reference values and savings, using the same comparison rule. |
| Checkout offers and payable amount | `components/CheckoutHydrator.tsx`, `lib/offers.ts`, and `lib/checkoutPricing.ts` choose the best eligible price and delivery offers, apply percentage or flat savings capped against their applicable base, and calculate payable amount from product subtotal and eligible delivery charge after offers. Website suppresses delivery-offer savings whenever subscriptions are present; price offers apply across one-time and subscription subtotals. | Mobile price-offer allocation and subscription bonus-entitlement calculation are present. Delivery offers currently sum a flat saving separately for each delivery charge and are not suppressed for subscription/mixed carts; this can over-discount a multi-date one-time cart and lower a subscription/mixed payable total. | Evaluate one delivery offer against the aggregate eligible delivery base once, suppress delivery savings for subscription or mixed carts, and keep displayed and persisted checkout totals derived from that same result. Preserve current price-offer and subscription-entitlement behavior. |

### Implementation and validation outcome

- The listing comparison found no source gap, so ProductCard display and option-aware add-to-cart were left unchanged.
- Updated `services/cart/cartService.ts` to calculate reference subtotal and savings per cart line with the shared strict original-greater-than-selling-price rule. Existing one-time, subscription, and mixed-cart unit prices and quantities remain unchanged.
- Updated `services/orders/customerOffers.ts` to compare delivery offers against the aggregate eligible delivery amount once and return no delivery savings when a subscription is present. Checkout display and mixed-checkout order creation already consume this shared offer result; no payment/session behavior was changed.
- Added or updated regression coverage in `tests/functional-gap-regressions.test.ts` for MRP visibility/scaling, per-line mixed-cart savings, combined price offers, one-time flat/percentage delivery savings, subscription/mixed-cart delivery-offer suppression, and payable totals.
- Final automated results: `npm run typecheck` passed with 0 diagnostics; `npm run test:regression` passed (24 tests); `npm run check:architecture` passed; `git diff --check` passed. No standalone lint/build script exists in `package.json`. Android runtime behavior was not tested.
- Product-list and Cart UI behavior was established by source inspection, not Android runtime testing. Phase 1's previously documented Firebase/Android UAT status is unchanged.

## Consolidated gap register

The findings below merge duplicate reports from the two audits. In particular, checkout query/write races, interrupted order creation, repeated taps, and retry recovery are one checkout-idempotency issue—not separate fixes.

| # | Unique issue and classification | Expected Website behavior / approved rule | Actual Mobile source behavior; cause and impact | Dependencies and recommended correction |
|---|---|---|---|---|
| 1 | **Checkout idempotency and interrupted-order recovery — Implemented in source; runtime races unverified; distinct-intent cross-device serialization out of scope** | One logical checkout attempt must not create multiple accepted order/subscription sets. Repeated taps, app interruption, and retry should resume or safely resolve the same attempt. Website retains server-side payment creation locking and active-session reuse; Mobile remains within the approved existing architecture. | A deterministic attempt ID is derived from signed-in auth UID and cart/address/date fingerprint. Deterministic pending order/subscription IDs are submitted in one atomic Firestore batch using merge semantics, preserving server-managed Cashfree fields on pending records. A query by `authUid` and `paymentAttemptId` recovers only a complete set whose customer, attempt, fingerprint, and linked subscriptions match; ambiguous write results are queried before retry. Ownership of each pending order is rechecked before payment, and a different or legacy-unmatched saved cart requires explicit confirmation before resuming. Order-detail payment retry also blocks unless the order auth UID matches the active Firebase user. Known Cashfree IDs are verified before retry; the existing server endpoint serializes session creation by primary order ID. Different simultaneous cart/address fingerprints are not globally serialized because no client-visible customer claim is permitted. Sources: `app/(customer)/checkout/index.tsx`, `app/(customer)/order/[id].tsx`, `services/payments/paymentAttemptStore.ts`, `services/orders/mixedCheckoutService.ts`, `services/orders/checkoutAttemptUtils.ts`, `services/payments/paymentService.ts`; Website evidence: `lib/server/cashfreeCreateOrder.ts`, `firestore.rules`. | **Source implementation complete; overall item remains incomplete pending Firebase/Cashfree/device UAT.** The current inspected Website UAT rules permit reads only of owned existing orders, so a transaction that reads deterministic non-existent paths is not usable under that contract. Pending order updates are constrained to retain ownership, status, total, and items; merge writes preserve Cashfree fields. Verify same-fingerprint concurrency, interrupted writes, rule behavior, and return/webhook races in approved UAT. Distinct concurrent checkout intents remain a documented server-claim limitation. |
| 2 | **Unserviceable-pincode enquiry — Implemented in source; Firestore/device delivery unverified** | Website offers an explicit enquiry choice for an unserviceable pincode; confirming saves a `NON_SERVICEABLE_PINCODE` enquiry and does not proceed with checkout. | Mobile now exposes a pincode-specific enquiry action, uses a deterministic enquiry document ID and writes to the existing `enquiries` collection. Success is shown after the write succeeds or an exact retry read verifies the saved request belongs to the customer. Failures remain visible and retryable. Checkout/payment is explicitly blocked while the selected address is unserviceable. Sources: `services/orders/deliveryChargeService.ts`, `app/(customer)/checkout/index.tsx`, `services/orders/customerContactRequestService.ts`, `services/orders/checkoutAttemptUtils.ts`. Website reference source: `components/CheckoutHydrator.tsx`, `lib/customerAlerts.ts` (`confirmPincodeUnavailable`); inspected Website UAT `firestore.rules` allows enquiry create and owned read, but denies customer update. | **Source implementation complete; overall item remains incomplete pending Firebase/device UAT.** Verify duplicate retry/read behavior, rule acceptance, and staff visibility. No order or payment is initiated for an unserviceable address. |
| 3 | **Subscription price fallback when no plan selling options exist — Confirmed gap** | Website makes a plan with no usable selling-option list available at its configured `plan.price`. If selling options exist but the selected packaging cannot be matched, the UI does not treat the unmatched option as an available selection. | Mobile `getSubscriptionPlanPriceForSellingOption()` returns `undefined` when no plan selling-option entry matches. Product Details consequently renders “Price unavailable,” while the selection/add path can still be enabled and the cart store can fall back to `plan.price` or product price. Impact: a purchase may be blocked despite a valid generic plan, or an amount may be added that was not shown. Sources: `services/subscriptions/subscriptionPlanPrice.ts`, `app/(customer)/product/[id].tsx`, `store/appStore.ts`. Website evidence: `components/ProductDetailPage.tsx` (`planEntries`). | **Phase 2.** Use the configured generic plan price only when the plan has no selling-option entries, matching Website semantics. When entries exist but the selected option cannot be resolved, show unavailable and prevent adding/updating the subscription. Use the same rule at Product Details, Cart, and order creation. |
| 4 | **Subscription selected-option price consistency — Potential, data-dependent** | The price selected for a package in Product Details must be the price validated and persisted at checkout. Website resolves the selected plan option by option identity/packaging and does not silently charge a different generic product price for a mismatched selection. | Product Details resolves plan options by selected option ID, then weight. Mixed checkout matches by ID only, then falls back to `plan.price` and ultimately product selling price. Cart has its own matching path. If IDs differ while weights match, or if option data is stale, checkout can use a different price than the displayed/selected `planPrice`. Sources: `services/subscriptions/subscriptionPlanPrice.ts`, `app/(customer)/product/[id].tsx`, `app/(customer)/(tabs)/cart.tsx`, `services/orders/mixedCheckoutService.ts`. | **Phase 2; related to #3.** Reuse one existing shared resolver (or a narrowly scoped helper) across Product Details, Cart, and checkout. Revalidate the selected option and configured `planPrice`; reject stale/unmatched selections instead of silently using a different fallback. |
| 5 | **Earliest valid subscription start-date enforcement — Confirmed boundary gap** | Subscription start must be a valid Saturday on or after the effective earliest date (next week’s Saturday). Website corrects invalid/stale cart dates and validates them again at mixed-checkout creation. | Product Details presents upcoming Saturdays, but Mobile Checkout and `createCustomerMixedCheckout()` pass the stored start/delivery date into availability and order creation without enforcing the earliest-date rule at that boundary. The separate direct subscription helper validates Saturday but not the earliest date. A stale or modified persisted cart date can bypass the picker. Sources: `app/(customer)/product/[id].tsx`, `app/(customer)/checkout/index.tsx`, `services/orders/mixedCheckoutService.ts`, `services/subscriptions/subscriptionService.ts`. Website source: `lib/cart.ts`, `lib/customerMixedCheckout.ts`. | **Phase 2.** Validate/normalize the subscription date at checkout and again in the order-creation boundary; force re-resolution/customer review if it changes. Do not change valid future dates or delivery scheduling. |
| 6 | **High-demand threshold and later-date handling — Confirmed Mobile/Website gap; decision recorded below** | Check the requested date first. If committed production demand plus the new request exceeds the applicable existing threshold, check the later date provided by the current Website Cart flow. If demand on that later date also exceeds threshold, offer enquiry only; do not offer another date or proceed. When the later date is valid, ask the customer to confirm before using it. Website Cart checks exactly two candidate Saturdays: the requested Saturday plus one subsequent Saturday (`CART_DELIVERY_DATES_CHECKED = 2`). | Mobile `resolveCartDeliveryDates()` currently stops after the first threshold breach, then Checkout offers an enquiry instead of checking the Website later date. For an actual batch shortage that resolves to a later date, Mobile Yes updates cart dates and returns; the customer must tap Checkout again. Website Cart asks about the proposed date and, on Yes, applies accepted dates and routes to Checkout. Sources: Mobile `services/orders/customerOrderAvailability.ts`, `app/(customer)/checkout/index.tsx`; Website `components/CartPage.tsx`, `lib/cartCheckoutDecisions.ts`, `lib/customerOrderAvailability.ts`, `lib/customerAvailabilityMath.ts`, `lib/customerAlerts.ts`. | **Phase 3.** Implement the recorded threshold decision using the Website Cart’s existing two-date horizon and existing configured threshold/demand inputs—do not add a threshold value or a third date. When the later candidate also exceeds threshold, use the existing enquiry path and stop. Keep actual batch-shortage search behavior aligned with existing approved Mobile requirements unless a separate approved rule changes it. On Yes, continue toward Checkout after applying dates; revalidate availability and payment before order placement. |
| 7 | **Consent before saving enquiry when no date is available — Confirmed gap** | Website offers an enquiry decision for unavailable items; an enquiry is written only on affirmative choice. Declining keeps the customer out of checkout and saves no enquiry. | If Mobile finds no candidate date within 12 weeks, Checkout automatically writes availability enquiries and returns without asking first. This is safe from order/payment creation, but lacks the Website customer-consent step. Sources: `app/(customer)/checkout/index.tsx` (`shouldSubmitAvailabilityEnquiry` branch), `services/orders/customerContactRequestService.ts`. Website source: `components/CartPage.tsx`, `lib/cartCheckoutDecisions.ts`, `lib/customerAlerts.ts`. | **Phase 3.** Present an explicit Send Enquiry / decline choice before writing. On decline or write failure, do not create an order/payment or imply the enquiry was saved. Keep the approved Mobile 12-week search behavior unless separately changed; Website currently checks a shorter Cart horizon, so do not silently alter Mobile’s horizon as part of this consent correction. |
| 8 | **Customer-facing re-decision after final availability recheck — Confirmed UX gap; fail-closed order safety present** | If availability changes between the earlier decision and order creation, Website returns `DELIVERY_DATE_RECHECK_REQUIRED`, creates no order/payment, and directs the customer to review/recheck dates. An internal stale decision should not be represented as an accepted checkout. | Mobile mixed checkout rechecks availability before committing its Firestore batch and throws `HARVEST_SHORTAGE_CONFIRMATION_REQUIRED` if the full quantity is no longer available. Checkout’s generic catch displays the thrown message; it does not rerun availability and reopen the correct date/enquiry choice. No order/subscription batch is committed in this branch. Sources: `services/orders/mixedCheckoutService.ts`, `app/(customer)/checkout/index.tsx`. Website source: `lib/customerMixedCheckout.ts`, `components/CheckoutHydrator.tsx`. | **Phase 3; depends on #6 and #7** so the repeated decision uses the approved high-demand, date-search, and enquiry-consent rules. Catch only known stale-availability outcomes, re-resolve, and ask again; retain fail-closed behavior on lookup errors or declined decisions. |
| 9 | **Mixed-cart behavior when a changed date is declined — Confirmed source divergence; decision recorded below** | Preserve the Website Yes/No confirmation. Yes accepts the proposed dates and proceeds toward Checkout with those dates, subject to final availability and payment validation. No sends the customer through the existing enquiry flow for items available only on the later date; those declined items must not be included in an order. In a mixed cart, Website saves the enquiry, removes the declined later-date items, then proceeds with unaffected on-time items; if none remain, it stays in Cart. This is an explicit popup choice, not silent removal. | Mobile saves enquiries for changed-date items and stops the entire checkout, including unaffected on-time items. It also returns after Yes applies resolved dates, requiring another Checkout action. Sources: Mobile `app/(customer)/checkout/index.tsx`; Website `components/CartPage.tsx`, `lib/cartCheckoutDecisions.ts`, `lib/customerAlerts.ts` (`confirmHighDemandDeliveryDates`). | **Phase 3.** Match the Website’s explicit prompt and mixed-cart result: No excludes only declined items after enquiry succeeds, and only unaffected on-time items may continue; never proceed under the declined date. Enquiry failure stops the flow. Yes applies the displayed dates and proceeds toward Checkout; final availability recheck remains mandatory. Do not silently remove items or silently continue. |

### Consolidation and evidence notes

- The general audit’s checkout idempotency finding and the shortage audit’s repeated-click/retry finding are consolidated as gap **#1**. The local tap guard is real, but it does not establish atomic cross-screen/device idempotency or recovery through the empty-order-ID interruption window.
- The subscription fallback (#3) and selected-option consistency (#4) are related but not duplicates: the first concerns a plan with no selling-option entries; the second concerns selected-option resolution and mismatched prices across UI/cart/checkout.
- The Website parity reference §1.3 says `maximumPlanPrice` is the subscription display reference. Current Website `ProductDetailPage.tsx` instead displays savings when selected one-time price exceeds the matched subscription price. Current Mobile Product Details uses that same selected one-time reference. This presentation was therefore **not** counted as a confirmed Mobile-vs-current-Website gap; the reference text is stale/conflicting and should be corrected only in a later approved documentation update.
- The Website reference describes Website checkout claims as part of parity, but DEVELOPMENT-RULES §9/§11 forbids a new Website API for normal checkout. The existing Website claim endpoint must not be used as the Mobile fix. A Mobile-native implementation must first be checked against Firestore security rules and existing architecture.
- Current Website code has a second availability check before its pending order/subscription batch; a stale shortage throws before commit. The Website’s intermediate partial-grams variable is not evidence that partial delivery is accepted because the later shortage guard aborts the batch.
- Findings are static source observations, not evidence of real duplicate orders, bad live plan data, pincode outcomes, successful enquiries, provider results, Firestore rule acceptance, or inventory mutation.

## Implementation phases

### Phase 1 — Checkout Safety and Enquiry

**Scope boundary:** Phase 1 contains only checkout idempotency/recovery and unserviceable-pincode enquiry. Subscription correctness and shortage/availability changes remain deferred to Phases 2 and 3.

**Scope**

1. Make order/subscription creation idempotent across repeated taps, concurrent attempts, app restart, and interruption after records are written but before local IDs are saved.
2. Add an explicit unserviceable-pincode contact/enquiry path using the existing direct Firebase/Firestore boundary.

**Affected source candidates**

- `app/(customer)/checkout/index.tsx`
- `services/orders/mixedCheckoutService.ts`
- `services/payments/paymentAttemptStore.ts`
- `services/orders/deliveryChargeService.ts`
- `services/orders/customerContactRequestService.ts` or a narrowly scoped sibling service
- Relevant Firestore security rules only if the existing direct-write contract requires a reviewed rule adjustment.

**Acceptance criteria**

- One payment-attempt identity maps to at most one complete set of one-time order and subscription records.
- A same-intent concurrent duplicate receives or recovers the same complete persisted result; it cannot create a second business-order set.
- Recovering an existing pending order must preserve server-written Cashfree identifiers and payment metadata.
- Before resuming payment, every saved order must match the signed-in Firebase auth UID and customer mobile. A saved attempt whose cart fingerprint differs from the current cart requires explicit customer confirmation.
- Closing/restarting at each point—before claim, during creation, after Firestore creation, before local IDs, before Cashfree session—recovers or safely reports state without creating duplicate records or opening a second payment for an unresolved attempt.
- Use the smallest safe mechanism supported by the existing Firebase/Firestore architecture and security rules, selected only after inspecting the existing rule and data contract. Do not introduce a new backend platform, Firebase Function, Website business API, or broad rewrite.
- The Cashfree session still receives all order IDs belonging to the attempt and server verification remains authoritative.
- Pending, failed, and abandoned payment do not consume inventory. Inventory is not reduced before successful payment finalization; fulfilment packing remains the inventory-consumption operation.
- Unserviceable pincode offers a clear enquiry choice. Yes writes one customer-scoped enquiry with `NON_SERVICEABLE_PINCODE`, pincode and relevant address/cart context; No creates no enquiry, order, subscription, or payment.
- Enquiry write failure is surfaced explicitly; it must not be presented as success.
- No new Website API or Firebase Function is introduced.

**Regression scenarios**

- Fast repeated taps, two mounted checkout screens, and simultaneous requests using the same attempt.
- Force-stop after attempt marker, after Firestore order batch, after order-ID persistence, and after Cashfree session creation; resume each state without replacing server-written payment fields.
- Exercise a pending-order ownership mismatch and verify checkout blocks before the Cashfree API call; confirm newly created pending orders carry the same auth UID as the ID token used for payment.
- Retry a payment from Order Details with both a matching and mismatching order `authUid`; only the matching signed-in customer may reach Cashfree.
- Verify mixed one-time + subscription and multi-date orders recover their full ID set.
- Confirm pending/failed/unknown attempts do not reduce inventory and do not create a second order set.
- Serviceable pincode follows existing checkout; unserviceable Yes saves enquiry only; No and enquiry-write failure save/charge/place nothing.

**Validation**

- Focused unit/regression tests for the idempotency state machine, pincode decision and payload, and order-ID recovery.
- `npm run typecheck`, `npm run check:architecture`, `git diff --check`, and relevant regression suite.
- Firestore Emulator or approved UAT verification of security rules, concurrent claims and interrupted recovery; native device and Cashfree sandbox verification for resume/payment continuity. Do not mark complete based on static checks alone.

**Implementation design (approved Phase 1, before code changes)**

- Derive the attempt ID deterministically from the signed-in auth UID and a normalized fingerprint of address, delivery slot, and cart lines/prices; persist that ID and existing order/Cashfree IDs in the current AsyncStorage payment-attempt record before order creation. This makes the same checkout intent converge across app restarts and devices. Serialize local get-or-create and marker writes/clears so multiple mounted screens cannot overwrite active recovery state.
- Derive order and subscription document IDs and display order numbers deterministically from that attempt ID plus stable order group/date or subscription index. Before writing, query/recover existing records by `authUid` and `paymentAttemptId`, including when the local marker has no order IDs. Use the existing atomic multi-document Firestore batch for all pending order/subscription documents with merge semantics, so server-written Cashfree fields are not erased by a same-attempt retry. If the batch response is lost or a concurrent batch conflicts, query by attempt identity and recover only the complete, matching record set; fail closed on a partial/mismatched set. Do not transact-read deterministic paths before creation because the inspected Website UAT customer read rules only authorize owned existing documents; a new claim collection is not permitted.
- Keep existing order/subscription fields and pending statuses. If a same-ID retry conflicts with existing immutable order contents under Firestore rules, fail explicitly rather than overwrite changed totals/items.
- On retry with known Cashfree ID, call the existing server verification API first: paid completes and clears the local attempt; pending stays in payment-status recovery; failed may request a new session for the same internal order IDs. When the local Cashfree ID was not saved but order IDs were, call the existing payment-session endpoint, whose current Website implementation serializes creation by primary order ID and reuses an active session. Keep server verification/webhook finalization authoritative. A failed payment retains the internal attempt marker so retry does not create another business-order set.
- Add a typed unserviceable-pincode error and an explicit checkout action. Save an enquiry to the existing `enquiries` collection with a deterministic customer/pincode/address request ID using create-only `setDoc`; the existing rules permit create and deny customer updates. On an uncertain/duplicate write result, read that exact document and verify its owner before treating it as saved. Enquiry success never continues to order/payment; a failed write remains actionable for retry.
- Do not create a new claim collection, modify Website code/rules, or add backend/API dependencies. The Mobile repository contains no `firebase.json` or Firestore rules file. The inspected Website UAT `firestore.rules` allows customer-owned pending `orders`/`subscriptions` and customer enquiries; reads require owned existing documents, pending-order updates preserve ownership/status/total/items, and unmatched client collections are denied. Deterministic identity and batch recovery converge on the same paths for the same fingerprint, but cross-device contention and Cashfree races still require UAT; distinct simultaneous checkout fingerprints cannot be atomically serialized at the customer level without a separately approved server/rules claim. Treat both as runtime verification and the distinct-intent case as a residual limitation.

This design preserves all payment/inventory invariants and does not change subscription pricing, subscription dates, high-demand, or mixed-cart decisions. If implementation exposes a need to cross the documented Mobile/server or Firestore-rules boundary, stop and request approval rather than expanding scope.

### Phase 2 — Subscription Correctness

**Scope**

1. Align generic `plan.price` fallback with Website behavior only when no selling-option entries exist.
2. Use a consistent selected plan selling-option resolver and configured `planPrice` through Product Details, Cart, Checkout, and order persistence.
3. Enforce the earliest valid Saturday at checkout and order creation, including stale persisted cart dates.

**Affected source candidates**

- `services/subscriptions/subscriptionPlanPrice.ts`
- `app/(customer)/product/[id].tsx`
- `app/(customer)/(tabs)/cart.tsx`
- `store/appStore.ts`
- `app/(customer)/checkout/index.tsx`
- `services/orders/mixedCheckoutService.ts`
- `services/subscriptions/subscriptionService.ts` only where its direct creation boundary requires the same guard
- `tests/functional-gap-regressions.test.ts` and focused subscription tests.

**Acceptance criteria and regression scenarios**

- Plan with no selling options displays/adds its configured `plan.price`.
- Plan with options matches the selected option by the agreed ID/weight rule and uses that option’s `planPrice`.
- Plan with options but no valid selected match is unavailable; no product-price or unrelated plan-price fallback is silently charged.
- Product Details, Cart totals, Checkout display, pending order total, and Cashfree amount use the same resolved price.
- A valid Saturday on/after earliest remains unchanged; invalid weekday, malformed date, or stale pre-earliest date is rejected/corrected and revalidated before order creation.
- Availability, order dates, and customer confirmation stay consistent when normalization changes a stored date.

**Validation**

- Focused resolver and checkout regression tests for absent options, matching/mismatching IDs, weight fallback, invalid prices, stale cart data, and date boundary conditions.
- `npm run typecheck`, `npm run check:architecture`, `git diff --check`, and relevant regression suite.
- Verify persisted pending order values and displayed values with representative Firestore plan/product fixtures; provider/device verification only if the payment presentation or native behavior is affected.

### Phase 3 — Shortage and Availability

**Scope**

1. For high-demand products, check the requested date and then the one subsequent Saturday in the existing Website Cart horizon; when both exceed the configured threshold, offer enquiry only.
2. Ask before saving an enquiry when no candidate date is available.
3. Re-resolve and show a customer-facing decision when final pre-order availability changes.
4. Preserve the explicit date Yes/No flow. On No, save enquiry for and remove the declined later-date items; allow only unaffected on-time items to continue, if any remain.

**Affected source candidates**

- `services/orders/customerOrderAvailability.ts`
- `app/(customer)/checkout/index.tsx`
- `services/orders/mixedCheckoutService.ts`
- `services/orders/customerContactRequestService.ts`
- `services/orders/customerEnquiryService.ts`
- `store/appStore.ts`
- `tests/functional-gap-regressions.test.ts` and focused availability/checkout tests.

**Acceptance criteria**

- Availability checks use direct Firebase/Firestore; they do not reserve/deduct stock.
- Search behavior distinguishes threshold high demand from started-batch shortage and follows the approved candidate-date horizon.
- Full quantity is the only accepted quantity; no partial line/order/subscription is written.
- Yes applies only the exact displayed/accepted date(s); it cannot silently change dates.
- No follows the Website-confirmed mixed-cart policy: enquiry first, exclude declined later-date items, and continue only with unaffected on-time items when present. An enquiry is not itself an order, subscription, or payment.
- No-date enquiry requires affirmative consent; decline, write failure, network error, or timeout never proceeds as though the request succeeded.
- A last-moment availability change re-runs the same customer decision path. No order/subscription writes or Cashfree session occur until the new outcome is accepted.
- Repeated availability prompts and any subsequent checkout use Phase 1 idempotency and cannot duplicate business records.

**Regression scenarios**

- Requested-date threshold breach with a later date below threshold; threshold breach on both candidate dates (enquiry only, no third date/order).
- Started-batch shortfall with later full availability; no date within configured horizon.
- Yes and No for each popup; mixed cart with on-time and later-date items, verifying No saves enquiry and excludes only declined items before remaining on-time items proceed.
- Date changes between first validation and final order creation; availability lookup failure; enquiry-write failure.
- Verify no order/subscription/payment on decline, no partial quantity, unchanged inventory before packing, and retry/idempotency after each accepted path.

**Validation**

- Focused unit/regression tests for date resolution, threshold-vs-batch classification, popup outcomes, no-date consent, mixed-cart branch, final re-prompt, and no-write/no-payment guarantees.
- `npm run typecheck`, `npm run check:architecture`, `git diff --check`, and relevant regression suite.
- Firestore Emulator/UAT verifies no pending/declined order counts as committed demand and no pre-payment inventory mutation. Device verification covers popup sequencing and date presentation. Verify successful Cashfree finalization and Admin packing inventory behavior in authorized UAT; do not infer either from client source.

## Recorded business decisions for deferred Phase 3

### High-demand products

1. Check production demand and complete-quantity availability on the requested date.
2. If requested-date demand exceeds the existing applicable threshold, check the later date permitted by the current Website Cart flow.
3. If later-date demand also exceeds threshold, present the existing enquiry choice only. Do not offer another date and do not proceed to order/payment.
4. If the later date is valid, show the existing explicit date confirmation; Yes accepts it, and No follows the enquiry behavior below.
5. Preserve the existing threshold source and comparison rule. Do not hardcode/change threshold values or add a candidate date.

Website evidence: `components/CartPage.tsx` passes `CART_DELIVERY_DATES_CHECKED = 2` and `searchAfterHighDemand: true`; `lib/cartCheckoutDecisions.ts` sets the constant to two (requested Saturday plus one subsequent Saturday); `lib/customerAvailabilityMath.ts` compares committed demand, cart reservations, and requested grams to the configured threshold. The threshold remains sourced from existing active-location data. If no candidate is acceptable because of high demand, the cart follows the enquiry path; it does not authorize order creation.

### Customer declines a changed delivery date

- **Yes:** accept the exact dates displayed, then continue toward Checkout. Checkout/order creation must revalidate availability; payment remains subject to the existing server-authoritative Cashfree flow.
- **No:** save an enquiry for items available only on the later date. The Website Cart then removes those explicitly declined items; unaffected on-time items may continue to Checkout. If none remain, stay in Cart. Enquiry failure stops the flow. No order may contain an item under the declined delivery date.
- This is not silent item removal or automatic continuation: the customer explicitly selects the No/Send Enquiry action before affected items are removed and any remaining cart can proceed.

Website evidence: `lib/customerAlerts.ts` labels the actions `Yes, Place order` and `No, Send Enquiry`; `lib/cartCheckoutDecisions.ts` saves each declined-item enquiry, removes that item, and proceeds to Checkout only for remaining on-time items. Mobile implementation must preserve full-quantity, final-availability, inventory, and payment rules.

## Verification boundary

Source review and regression tests confirm code paths and write ordering only. They cannot prove Firestore rules accept/reject actual writes, same-intent concurrent runtime requests converge, enquiries reach staff, or a device renders the popup correctly. Current checks pass: `npm run typecheck` (0 diagnostics), `npm run test:regression` (21 tests), `npm run check:architecture`, and `git diff --check`. The required actual Firebase persistence and Android device/emulator tests were unavailable: no adb-connected device, no emulator binary, no Mobile Firebase emulator/project config, and no Firebase variables in the current process. Payment tests/UAT were explicitly not run. Phase 1 remains blocked until approved Firebase and Android runtime checks are performed.


### Mobile checkout precision and delivery-offer parity follow-up (2026-10-18)

The source audit confirmed that `services/orders/customerOffers.ts` still applied a delivery-charge offer when a subscription entry was present, contrary to the approved parity rule in gap 5. The follow-up implements the documented rule: delivery-charge offers are evaluated only for one-time-only carts; price offers and subscription entitlements remain unchanged. Monetary allocation and persisted-total reconciliation use one INR two-decimal helper. This is a source/test change only; Cashfree sandbox and Firestore runtime verification remain separate.
