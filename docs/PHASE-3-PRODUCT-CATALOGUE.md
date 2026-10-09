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
- Show MRP when applicable.
- Show selling price.
- Show savings when applicable.
- Add the selected product/package as a one-time cart item.

Do not perform availability/threshold validation on Product Details. That happens during the order flow.

## 5. Subscription Purchase

For a subscription-eligible product:

- Show **Subscription** as another purchase option on Product Details.
- Selecting Subscribe must show the customer an explicit subscription start-date selector, matching the Website flow. The selected date must be a valid Saturday on/after the next eligible Saturday.
- **Subscription plans are Product-specific.**
- Only active subscription plans whose Website master field `salableProductId` matches the currently displayed salable Product ID may be shown. Do not substitute Mobile-only `productId` matching for this Website field.
- Never show a Monthly/Quarterly plan belonging to another Product.
- Show the plan price and delivery/term information from the matching Product plan.
- When the selected Product selling option has a Product-specific subscription-plan price, use that selling-option plan price; do not substitute another Product's price or the generic plan base price when a specific option price exists.
- Allow one matching plan to be selected.
- Use the same selected product packaging/selling option for the subscription purchase where the Website business model requires it.
- Add the subscription selection to the existing Mobile cart model.

Do not create a second subscription purchase flow from Product Details.

Subscription delivery dates, address validation, shortage/threshold validation and final checkout remain later-phase responsibilities.

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

Approved rule from the current source and shared Website contract: combo/multiple salable products are not eligible for subscription purchase.

The Mobile product logic already defines this in the canonical eligibility helper, and the UI and checkout flow must enforce the same rule on every path:

- `type === 'multiple'` is treated as ineligible for recurring subscription purchase.
- A product must also be `active`, `subscriptionPurchase === true`, and backed by a single valid component definition before it may be subscribed to.
- Revalidation is still required at checkout because stale client state or an old cart entry must not bypass the rule.

The source mismatch that required this fix is that the product-detail screen was only checking `product.active && plans.length > 0`, which left combo products exposed to subscription UI if plan data still existed. The fix is to centralize the policy in a pure eligibility helper and reuse it in the UI and in the creation path.

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
- Once an item is in the cart, Product Details shows the current quantity with decrease/remove and increase controls instead of only Add to Cart.
- Subscription plans are loaded using the Website `salableProductId` field and only the current Product's active plans are displayed.
- Subscription plan selection does not create a separate confusing purchase flow.
- Selected product/package/plan is added to the existing cart model.
- MRP/selling price are consistent with the selected option.
- No product-level Sold Out state is introduced.
- Architecture check passes.
