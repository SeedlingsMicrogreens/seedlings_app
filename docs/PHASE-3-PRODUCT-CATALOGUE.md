# Seedlings Mobile — Phase 3 Product Catalogue & Product Details

**Status:** Updated / approved for implementation
**Date:** 2026-10-05

## 1. Goal

Provide Product Catalogue and Product Details with the **same customer purchase meaning and flow as the Website**. Mobile may use native React Native components, but it must not invent a different purchase journey that can confuse customers.

## 2. Product Details Purchase Flow — NON-NEGOTIABLE

Product Details uses one consistent purchase flow:

```text
Product
  ↓
Packaging / selling option
  ↓
Choose purchase option
  ├── One-time purchase
  └── Subscription plan (when eligible)
  ↓
Add to Cart
```

Do not create a separate Mobile-only subscription journey from Product Details.

Do not require the customer to open a separate subscription screen/modal merely to select a subscription plan when the Website presents the purchase choice on Product Details.

The customer should understand the difference between One-time and Subscription from the same Product Details screen.

## 3. Packaging / Selling Option

The customer selects the active selling option/packaging before choosing the purchase mode.

The selected option controls:

- Weight
- MRP
- Selling price
- Cart line identity

Use the configured `sellingOptions` data. Do not hardcode package sizes or prices.

### CI-01 verification status

The current Mobile source already preserves the selected one-time selling option's `id`, `price`, and `mrp` in the cart and refreshes the live option from `salesProducts` during checkout. The cart updates are keyed to the selected option rather than stale default values, so no implementation-only workaround is required beyond preserving this contract.

### CI-02 verification status

The current Mobile source already matches the shared Website/Admin unit contract:

- `100g` parses to `100` grams.
- `200g` parses to `200` grams.
- `1kg` parses to `1000` grams.
- `1.5kg` parses to `1500` grams.
- `packaging` is the per-pack grams value.
- `weightGrams` is the line-total grams value for the order/subscription item, which is `packaging × quantity`.
- Checkout and availability logic pass the correct packaging size and quantity to the availability decision and order line generation.
- Subscription records and order detail rendering use the same packaging label and total weight values from the current shared contract.

No additional Mobile-only weight conversion is required when the source already follows the Website/Admin data contract. The authoritative value is the actual implementation in `services/orders/weightUtils.ts` and the live checkout/order-building flow, not older phase wording.

The customer-facing Website uses a packaging dropdown/select. Mobile must use the same interaction model: **Packaging is a dropdown/select**, not a separate set of package cards/buttons. The business flow and terminology must remain the same.

## 4. One-time Purchase

For an eligible product:

- Show **One-time purchase** as a purchase option.
- Show the selected packaging/weight.
- Show the purchase-option name and description.
- Show the selected selling option's original MRP with strikethrough when it exceeds its selling price.
- Show the selected selling option's selling price prominently in green.
- Show the savings amount when applicable.
- Add the selected product/package as a one-time cart item.

Do not perform availability/threshold validation on Product Details. That happens during the order flow.

## 5. Subscription Purchase

For a subscription-eligible product:

- Show **Subscription** as another purchase option on Product Details.
- Selecting Subscribe must show the customer an explicit subscription start-date selector, matching the Website flow. The selected date must be a valid Saturday on/after the next eligible Saturday.
- **Subscription plans are Product-specific.**
- Only active subscription plans whose Website master field `salableProductId` matches the currently displayed salable Product ID may be shown. Do not substitute Mobile-only `productId` matching for this Website field.
- Never show a Monthly/Quarterly plan belonging to another Product.
- Show the plan name and delivery/term description from the matching Product plan.
- Show the selected subscription selling price prominently in green.
- When a discount applies, show the applicable original/reference price with strikethrough and the savings amount.
- When the selected Product selling option has a Product-specific subscription-plan price, use that selling-option plan price; do not substitute another Product's price or the generic plan base price when a specific option price exists.
- Allow one matching plan to be selected.
- Use the same selected product packaging/selling option for the subscription purchase where the Website business model requires it.
- Add the subscription selection to the existing Mobile cart model.

Do not create a second subscription purchase flow from Product Details.

Subscription delivery dates, address validation, shortage/threshold validation and final checkout remain later-phase responsibilities.

### Selling-option price presentation — MD-first requirement

For both one-time and subscription purchase options, keep the existing Mobile selected-option highlight and display the option name/description alongside its price details. Stack the applicable crossed-out original/reference price (only when greater than the current price), the current selling price in green, and the savings amount when applicable. Keep this change presentation-only; do not alter price resolution, cart values, offers, packaging, or purchase behavior.

Use the Website `components/ProductDetailPage.tsx` purchase-option field meanings:

- **One-time:** the selected Product selling option's `mrp` is the original/reference amount and its `price` is the current selling amount. Display savings only when `mrp > price`, calculated from those existing values.
- **Subscription:** the selected plan's matching selling-option `planPrice` (using the existing Mobile plan-price resolver) is the current selling amount. Resolve by selected packaging weight first and fall back to selling-option ID only when no weight match exists, matching the Website pricing contract. The original/reference amount is that matched selling option's `maximumPlanPrice`; show savings only when this valid value exceeds the resolved subscription selling amount. Never substitute one-time Product price or MRP. This approved rule supersedes the earlier Mobile-only comparison with the one-time price.
- The displayed prices and savings must use existing values and the existing Mobile resolver; do not introduce or change pricing calculations.

The current implementation must use the matched plan option's configured `planPrice` and `maximumPlanPrice` without substituting a price for a selected package.

### Product Details subscription option discovery — MD-first requirement

- One-time purchase is available whenever the active salable Product has a valid active selling option; do not gate Product Details on legacy `oneTimePurchase`, `oneTimeEligible`, or equivalent flags.
- Resolve the product by its Firestore `salesProducts` document ID and load only plans associated by the Website field `salableProductId`; trim identifier whitespace but do not substitute `productId`, `salesProductIds`, or another association.
- The existence of an active, valid Product-associated plan determines whether subscription options are offered. Do not gate display on legacy `subscriptionPurchase`, `subscriptionEligible`, or structural eligibility flags. Do not show inactive, invalid, or cross-product plans.
- Preserve Website subscription pricing: match plan selling options by selected packaging weight first, then by trimmed selling-option ID. Use `plan.price` only when no package is selected; a missing match for a selected package remains unavailable. Ignore invalid option prices rather than displaying them.
- For a selected package, show the plan selling amount and use only that matched plan option's valid `maximumPlanPrice` as the original/reference amount. Show strikethrough and savings only when this reference amount exceeds the selling amount. Never use one-time Product price/MRP as a subscription reference.
- Distinguish plan loading, a confirmed empty result, and a Firestore load error. A failed read must show a retryable error rather than masquerading as a product with no subscription plans. Clear prior-product plan state when the route changes.
- The Product Details Add to Cart action must add the currently selected purchase mode and packaging through existing cart-store actions, prevent concurrent duplicate taps, and navigate to Cart only after success. On failure, retain the customer on Product Details and show a retryable error. Preserve existing quantity and remove controls in Cart; the badge count remains the sum of one-time and subscription quantities.
- Test flag-independent one-time/plan availability, exact `salableProductId` association, active/inactive filtering, weight/ID option resolution, reference/savings display, loading/empty/error states, and Add to Cart count/navigation/failure behavior.

### Product Details subscription discovery — implementation result

- Product Details previously converted every subscription-plan read error into an empty `plans` array. Because rendering required `plans.length > 0`, a failed read was indistinguishable from a genuinely eligible Product with no active plans and silently removed the subscription options.
- The Product Details and plan service also repeated plan filtering, while a Firestore equality query on `salableProductId` could not return values with incidental surrounding whitespace. If the exact association query yields no valid plans, the service scans active plans and retains only those whose trimmed `salableProductId` exactly matches the current Product ID. No `productId`/alias fallback was added.
- Plan loading now has explicit loading, empty, ready, and retryable error states. Product route changes clear old product and plan state. Subscription option display is based on active Product-associated plans, not legacy Product eligibility flags.
- Plan selling-option matching is shared between current-price and reference-price resolution, prioritizes selected packaging weight, then uses a trimmed selling-option ID fallback. Subscription original price and savings use only a valid matched `maximumPlanPrice`; one-time Product prices/MRP are not substituted. The generic `plan.price` is permitted only when no packaging option is selected. A plan without a valid price for a selected Product option cannot be added to Cart; packaging is not substituted.
- Regression tests cover flag-independent Product purchase availability, an associated active plan, another Product's plan, inactive and invalid plans, identifier whitespace, weight-priority/ID-fallback pricing, invalid option prices, no-match behavior, base-price fallback only with no selected package, and each section state.
- The 2026-10-13 purchase-options correction removes legacy one-time/subscription flag gates. One-time checkout revalidates that the salable Product is active; subscription checkout revalidates that the plan is active and its `salableProductId` exactly matches the Product.
- Product Details Add to Cart now uses a single-flight guard, persists the selected package and purchase type through the existing store, navigates to Cart after successful persistence, and shows a retryable error without navigating when the cart write fails. Existing item quantities are incremented while preserving the newly selected package.

### Floating Cart access from Product Details — approved requirement

- Product Details displays a floating bottom-right Cart action with the existing cart icon and a reactive badge sourced directly from shared Zustand `cart` and `subscriptionCart` state.
- The badge uses existing `getCartItemCount` semantics: sum line quantities from both purchase-type collections; represent an empty cart as zero; do not maintain a separate counter or mutate cart state.
- Cart content/quantity changes, removal, hydration, and navigation updates are reflected by observing the existing shared store. Existing Cart tab and its badge remain unchanged.
- Tapping the action navigates to the existing `/(customer)/(tabs)/cart` route without changing cart entries or selections.
- The floating control must respect bottom safe-area insets, remain reachable above system navigation, and reserve scroll-end clearance so it does not obscure Product Details purchase controls or descriptions. Preserve existing Add to Cart and quantity controls.
- Regression coverage must exercise count values across one-time and subscription lines as quantities are added, changed, and removed; empty-cart count; and existing navigation-after-success behavior. Product pricing, packaging, cart operations, checkout, and payment are out of scope.
- Implementation: Product Details selects `getCartItemCount` from shared Zustand cart state, displays a zero badge for an empty cart and caps the badge display at `99+`. The floating button uses the existing Cart tab route and the same route constant as successful Add to Cart navigation. A scroll-end spacer reserves button clearance. No cart or purchase behavior changed.
- Validation passed: `npm run typecheck`; `npm run test:regression` (40 tests, 0 failures); `npm run check:architecture`; `git diff --check`. Android device `e67876c5` is connected, but Product Details was not rendered or visually inspected for this change.
- Regression coverage verifies valid one-time options despite false legacy flags, subscription-plan visibility independent of those flags, inactive/cross-product plan filtering, `maximumPlanPrice` savings only, count/navigation/duplicate suppression, and add failure/retry.
- Validation: `npm run typecheck` passed (0 diagnostics); `npm run test:regression` passed (31 tests); `npm run check:architecture` passed; `git diff --check` passed. No standalone lint/build script is defined in `package.json`. Android runtime verification was not performed in this task; live Firebase plan data was not inspected.

## 6. Product Catalogue

The catalogue provides:

- Product listing
- Product image
- Product name
- Packaging/weight display
- MRP
- Selling price
- Discount/saving where applicable
- One-time purchase entry
- Cart quantity controls for an already-added one-time product
- Search
- Category filtering
- Mood filtering where configured
- Product Details navigation

## 7. Product Cache

Product data is read from Firestore through the Mobile product service.

SQLite is the local cache.

Cache TTL:

```text
24 hours / 1 day
```

A valid cache is used without an automatic Firestore refresh on every screen mount. Firestore is read when cache is missing/stale or an explicit refresh is requested.

No Website API is used for product data.

### CI-29 verification status: product cache-miss retry

The current Mobile source already follows the correct network/cache contract:

- `getProducts()` in [../services/products/productService.ts](../services/products/productService.ts) reads the SQLite cache first, validates its age, and fetches Firestore when the cache is empty, stale, or explicitly forced to refresh.
- If a remote fetch fails while the cache is still valid, the fallback path returns the cached catalogue rather than failing the screen.
- If the cache is empty and the remote fetch fails, the error is surfaced to the caller and the screen can retry through the existing UI pattern in [../app/(customer)/(tabs)/products.tsx](../app/(customer)/(tabs)/products.tsx).
- Product details load from the same refreshed catalogue list and only fall back to a not-found state when the product really does not exist in the authoritative source.
- The current source does not invent a separate stale-price path; the checkout flow re-reads product data and uses the fresh product list before final validation.

This is already an implemented and verified Mobile-side behavior. No forced product-cache rewrite or additional retry architecture is required unless a concrete runtime bug is reproduced against the current source data.

### CI-30: combo subscription eligibility rule

**Superseded for Product Details purchase-option availability by the approved 2026-10-13 rule above.** Active, valid subscription plans associated to the current active salable Product by `salableProductId` determine whether the option is shown. Do not gate Product Details display on `type`, component count, `subscriptionPurchase`, or another legacy eligibility flag.

Order fulfilment still validates the Product's actual production component data and selected plan association. That operational validation must not be reused to hide an otherwise valid associated active plan from Product Details.

## 8. Product Details Content

Product Details may show:

- Product image
- Product name
- Product type
- Short description
- Full description
- MRP/selling price
- Saving amount
- Availability information
- Delivery information
- Packaging/selling options
- One-time purchase
- Subscription plans where eligible
- Subscription start-date selection is shown when entering the subscription purchase flow; the subscription-management page does not list available plans.

HTML descriptions are converted to native text. Do not embed a Website page just to render Product Details.

## 9. Availability Boundary

Product Catalogue/Product Details must not decide whether an order can be fulfilled.

Phase 5 owns:

- Started batch availability
- Production Threshold
- Existing demand
- Full-quantity validation
- Next available delivery date
- High-demand enquiry
- No partial delivery

Do not introduce Sold Out/Currently Unavailable as a product-level state.

## 10. Scope

### Included

- Catalogue
- Search/filtering
- Product card
- Product Details
- Product content/images
- MRP/selling price
- Packaging/selling-option selection
- One-time purchase
- Subscription plan selection on the same Product Details purchase flow
- Product-specific subscription plan filtering
- Product-specific subscription plan pricing
- Existing-cart quantity controls on Product Details
- Add to existing cart model
- 1-day SQLite product cache

### Not included

- Threshold validation
- Delivery-date resolution
- Checkout
- Payment
- Order finalization
- Subscription lifecycle management

## 11. Development Rule

Update this document before changing the Phase 3 architecture. Inspect the latest Mobile source and the current Website behavior/screens before implementation. Implement Mobile-native UI while preserving the Website purchase flow and terminology.

## 12. Exit Criteria

- Catalogue works from Mobile Firebase/Firestore service.
- SQLite product cache uses 1-day TTL.
- No Website API is used for product data.
- Product Details has one clear purchase flow.
- Packaging is selected before purchase mode using a dropdown/select matching Website UX.
- One-time and Subscription are clearly distinguishable.
- Each one-time/subscription purchase option shows its name and description, current selling price in green, and the applicable crossed-out reference price and savings when discounted; values match the existing Website field meanings without changing Mobile pricing calculations.
- Once an item is in the cart, Product Details shows the current quantity with decrease/remove and increase controls instead of only Add to Cart.
- Subscription plans are loaded using the Website `salableProductId` field and only the current Product's active plans are displayed.
- Subscription plan selection does not create a separate confusing purchase flow.
- Selected product/package/plan is added to the existing cart model.
- MRP/selling price are consistent with the selected option.
- No product-level Sold Out state is introduced.
- Architecture check passes.
