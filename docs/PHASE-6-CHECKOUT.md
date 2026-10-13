# Phase 6 — Checkout

## Status
Implemented — visual alignment refinement 2026-10-05.

## Goal
Implement the Mobile Checkout review flow using the resolved delivery dates from Phase 5, with the same customer-facing business behavior as the current Website Checkout.


## Locked Website-aligned checkout presentation

This section follows the Website behavior verified in the read-only `seedlings_website_otp_cors_fixed` source: `components/CheckoutHydrator.tsx` (`renderDelivery`), `lib/checkoutPricing.ts` (`checkoutSavingsBreakdown`, `resolveSubscriptionPlanSavings`), and `app/globals.css` (`.checkout-savings-banner`). The Website route is `app/checkout/page.tsx`, which mounts `CheckoutHydrator` around its checkout prototype.

- Group purchase rows by One-time purchases and subscription purchases where applicable.
- Website price rows display valid original amounts with strikethrough; applied price-offer savings strike through the pre-offer item total and show its final price alongside in bold. One-time MRP is sourced from the selected one-time item. Subscription reference price is resolved from the selected plan selling option's `maximumPlanPrice`, not the Product's one-time MRP.
- Website's price-offer message is one product-savings banner. Its total is `mrpSavings + priceOfferSavings`, with a breakdown containing the MRP and/or offer components that are positive. With only MRP savings and no applied offer, it shows the product-pricing message. Offer name uses the selected `priceOffer.name`, cleaned and suffixed with “offer” when needed.
- Delivery savings have their own banner and use the selected delivery-offer name. Delivery's original total is struck through and its payable charge is bold/green when the delivery offer applies.
- Subscription-plan savings have their own message and are sourced from the selected plan option's valid `maximumPlanPrice` minus `planPrice`, scaled by quantity. They are not promotional price-offer savings.
- The Website `checkoutSavingsBreakdown` clamps invalid/negative inputs to zero and rounds monetary savings to two decimals. It defines `productSavings = mrpSavings + priceOfferSavings`; combined savings is `productSavings + subscriptionPlanSavings + deliverySavings`, each included once. The combined-savings message is rendered separately only when the total is positive.
- Mobile must use the already-calculated eligible price/delivery offer results and saved Product/plan reference data for display. The display breakdown must never be applied as a second discount.
- Preserve the product subtotal, one Delivery charge row, unique-date explanatory note when applicable, and Grand total. Website payable total is subtotal plus base delivery minus applied price-offer and delivery-offer savings; reference-price and subscription-plan savings are informational and are not subtracted again.
- Do not change offer eligibility, offer selection/stacking, pricing, delivery calculation, cart contents, validation, or payment behavior.
- Do not show all future subscription delivery dates.
- Address selection remains part of checkout logic; visual emphasis is on the Website-aligned order review and payable total.

## Non-negotiable rules

1. Checkout uses the selected saved delivery address.
2. If no address exists, send the customer to the existing address management flow; do not invent a second address system.
3. Saturday is the configured delivery day. Customer must NOT select an arbitrary delivery day or delivery slot.
4. Checkout displays the actual resolved delivery date for each one-time item and **only the first/next delivery date** for each subscription item. Future subscription dates remain internal for scheduling and delivery-charge calculation.
5. Delivery dates come from Phase 5 availability resolution. Checkout must not silently replace them with a default date.
6. Delivery charge is calculated from the actual unique delivery dates across the complete checkout.
7. The same pincode delivery charge is charged once for each unique actual delivery date, even when multiple products/subscriptions share that date.
8. Subscription plan delivery-charge overrides are NOT used.
9. Old Delivery Charges Master / separate one-time-vs-subscription charge logic must not be reintroduced.
10. Checkout shows one `Delivery charge` row, not separate one-time/subscription delivery rows.
11. The customer-facing total must use the same Website calculation: product subtotal after applicable price offers/discounts plus delivery charge after applicable delivery offers. The final amount must be the value passed to the payment/order flow.
12. Checkout does not reserve inventory.
13. Checkout does not reduce inventory.
14. Availability is revalidated before order creation/payment in the later payment/order phase.
15. Payment processing itself belongs to Phase 7; this phase is the checkout review and validation layer.
16. Checkout business rules are implemented natively from the shared Website behavior; Mobile must not call Website APIs for normal checkout data/business rules. Payment/authentication server APIs remain the separately approved exceptions.

## Locked checkout structure

1. Delivery address
2. Purchase rows with product, packaging, quantity, payable selling price and resolved delivery date
3. One compact price summary: product subtotal after offers, non-duplicated applicable offer savings, one Delivery charge row, Grand total
4. Continue to Payment

Do not show a separate MRP total or duplicate savings rows unless the current approved Website checkout has them. The Website implementation and this locked requirement must be reconciled before any future checkout UI change; do not infer the layout from older Mobile screenshots or code.

## Delivery-date calculation

- One-time item: its Phase 5 resolved `deliveryDate`.
- Subscription item: Checkout displays only its Phase 5 resolved first/next `deliveryDate`.
- Subscription future delivery dates remain internal and are used for delivery scheduling and delivery-charge calculation.
- Duplicate dates are de-duplicated before calculating delivery charge.
- When one-time items resolve to different delivery dates, order creation must preserve one order document per resolved date. Each one-time order's `scheduledDeliveryDate`/`deliveryDate` must match only the items in that order.

## Payment Attempt and Order Contract

- Mobile checkout persists a pending payment attempt before creating orders and reuses it when the customer repeats Checkout.
- The same payment attempt must never create a second set of business orders.
- The Cashfree session request must include every order id in the attempt, including multiple one-time orders and subscription orders.
- Order and subscription item identity must follow the Website/Admin contract: `salableProductId` and customer-facing `productId` store the `salesProducts` id; `sellingOptionId`, `sellingOptionLabel`, per-pack `packaging`, and line-total `weightGrams` are stored on every line.
- Server-authoritative amount and availability validation belongs to the Website Next.js payment/order API. Mobile must call the approved payment API and compare the returned amount, but client-side validation alone is not production payment verification.

## Manual verification required before Phase 7

1. Checkout shows the selected address.
2. No arbitrary delivery-slot selection is shown.
3. One-time item shows its resolved delivery date.
4. Subscription item shows only its first/next resolved delivery date.
5. Two items on the same delivery date produce one delivery charge.
6. Items on two different delivery dates produce two delivery charges.
7. Mixed one-time + subscription checkout uses the unique-date calculation.
8. Subscription plan delivery-charge override has no effect.
9. Checkout total equals subtotal minus product savings plus delivery charge.
10. Changing address/pincode recalculates delivery charge.
11. Checkout makes no inventory reservation/reduction.
12. Checkout makes no normal Website API call.
13. Empty/invalid cart cannot continue.
14. Missing address cannot continue and can be fixed through Address management.

## CI-23 verification status — totals and rounding

After auditing the current Mobile source, no defect was found in the core totals math for CI-23. The source-of-truth is consistent across the flow:

- Cart totals are derived from `price × quantity` in [services/cart/cartService.ts](../services/cart/cartService.ts) via `getUnifiedCartTotals()`.
- Checkout display totals use the same subtotal plus any applicable product and delivery savings in [app/(customer)/checkout/index.tsx](../app/(customer)/checkout/index.tsx).
- Mixed order creation applies the same subtotal logic and recalculates delivery fees using actual unique delivery dates in [services/orders/mixedCheckoutService.ts](../services/orders/mixedCheckoutService.ts).
- Payment session values are checked against the persisted business total before the flow is accepted, and the authoritative verification remains server-side in [services/payments/paymentService.ts](../services/payments/paymentService.ts).

The relevant rules are therefore already implemented and aligned with the Website contract: line totals use unit price × applicable quantity; delivery is charged once per unique actual delivery date; and the actual payment amount remains server-authoritative. This means CI-23 is currently an evidence-backed “already implemented and verified” case rather than a source bug requiring a code fix.

## Implementation validation

Before handing over the Phase 6 ZIP, validate TypeScript syntax and inspect the checkout path for stale slot-selection or old delivery-master references. If dependencies are unavailable in the ZIP environment, do not claim a full typecheck/build; provide the exact validation command for the user's environment.

## Checkout offer presentation implementation — 2026-10-13

- Website source investigation verified these data rules: product savings are one-time MRP/reference savings plus the selected price-offer saving; delivery-offer and subscription-plan savings render in separate offer messages; total savings is product savings + subscription-plan savings + delivery savings. Its helper clamps invalid/negative amounts and rounds each category to two decimal places. The Website payable total subtracts only applied price and delivery offers, not reference or plan savings a second time.
- The Website renderer resolves subscription reference price from the selected subscription selling option's `maximumPlanPrice`. Mobile cart stores the selected plan reference in the subscription item's `mrp`; Checkout must use that subscription-specific reference and never the Product's one-time MRP.
- Website offer labels come from the selected applied offer, normalized and suffixed with “offer” when needed. Product message includes positive MRP and promotional breakdown components; delivery and subscription plans have their own message; combined savings is separate.
- Website uses `.checkout-savings-banner` (light-green surface, green text, separate product/delivery/subscription messages) and `.checkout-savings-combined` for a centered prominent total. The Mobile implementation should reproduce these data groupings using native Mobile styles while leaving Mobile amount formatting and payment total intact.
- Mobile now uses the verified category breakdown in `services/orders/checkoutSavings.ts`. One-time MRP savings + selected price-offer savings appear in the product message; delivery and subscription-plan savings each appear separately; combined savings adds the resulting product amount, subscription-plan savings and delivery savings once.
- Product and subscription rows render valid reference prices struck through and, when a price offer is applied, show the pre-offer total struck through beside the green final price. Subscription reference metadata no longer falls back to the one-time Product price when a plan reference is absent.
- `app/(customer)/checkout/index.tsx` is the Expo Router checkout screen and its `Checkout()` route implements these rows. Savings messages render after delivery charges/offers are successfully resolved. Its existing `calculateCheckoutPayableTotal` remains unchanged; only actual price/delivery offer savings are payable discounts.
- Regression coverage: price/reference display; applied price + delivery offer savings; separate subscription savings; combined savings without duplicates; malformed savings sanitization; no Product-price fallback for a missing subscription maximum; and unchanged payable amount.
- Validation passed after the final edits: `npm run typecheck`; `npm run test:regression` (34 tests, 0 failures); `npm run check:architecture`; `git diff --check`. The test run initially exposed non-finite input handling; the helper now treats non-finite presentation inputs as zero. No standalone lint/build script exists in `package.json`.
- Android device `e67876c5` is connected, but the changed Checkout screen was not built/launched/rendered for runtime visual comparison. Live offers/cart data and device rendering remain unverified.

## Website Checkout row and amount parity — 2026-10-14

Verified against the current Website `components/CheckoutHydrator.tsx`, `lib/checkoutPricing.ts`, and `app/globals.css`. This addendum supersedes older presentation-only wording above where it differs; it does not change the locked Mobile delivery-date, offer-eligibility, calculation, or payment rules.

- Render the Subscriptions group before One-time purchases, and only when each group has cart entries. Each row identifies the product and quantity together, with the package/plan and resolved first delivery date below. Subscription rows also show the actual entitlement message from the eligible subscription offer; when there is no bonus offer, the plan's regular delivery count is rendered as “N deliveries total”.
- One-time reference pricing is the selected selling option's MRP. Subscription reference pricing is the selected plan selling option's valid `maximumPlanPrice`; it must not fall back to Product MRP. A reference amount is shown struck through only when it is valid and greater than the selling amount.
- When an applied price offer reduces a row, show its pre-offer line total struck through beside the final offer price. The existing selected offer and allocated savings remain authoritative; UI display must not recalculate or apply a second discount.
- Website money formatting uses the `en-IN` currency formatter with exactly two fractional digits. Checkout Mobile display should match this precision while keeping existing INR and price-total semantics.
- Show the delivery-charge row after purchase rows. Retain Mobile's existing unique-actual-delivery-date calculation and breakdown note. When a delivery offer is applied, show the original charge struck through and its discounted charge in green.
- After the delivery row, show the Website's distinct savings messages: one product message combining positive one-time MRP and price-offer savings (with their breakdown), one delivery-offer message, and one subscription-plan savings message, each only when its corresponding savings is positive. Show the combined savings in a separate centered green panel after these messages.
- The combined informational savings amount is `product savings + subscription-plan savings + delivery savings`, each counted once. The payable total continues to use only the applied price-offer and delivery-offer reductions; MRP and subscription-plan reference savings are not subtracted again.
- Keep the existing Mobile order summary, delivery computation, customer offer resolution, checkout validation, cart behavior, and payment flow otherwise unchanged.

Implementation gaps confirmed before code changes: Mobile displayed checkout amounts rounded to whole rupees rather than Website's two fractional digits; displayed purchase groups in the opposite order from Website; its row showed quantity in package metadata rather than alongside the product name; and the no-bonus subscription delivery text omitted “total”. The product savings panel also appeared before the delivery-charge row, unlike the Website's order of delivery charge followed by savings messages.

## Checkout payable subtotal and delivery-offer parity — 2026-10-14

Verified against Website `components/CheckoutHydrator.tsx`, `lib/checkoutPricing.ts` (`checkoutDeliveryChargeAmounts`, `computeCustomerOffers`, `allocateCheckoutTotals`), and the Mobile `services/orders/customerOffers.ts` and `deliveryChargeService.ts`. This decision supersedes the older Mobile-only statement that delivery offers are suppressed for subscription/mixed carts.

- Display Product subtotal as the payable product amount after the authoritative `offerResult.priceSavings`: `max(0, cart subtotal - applied price savings)`. This is distinct from MRP/reference savings, which remain informational and are not subtracted. The same shared helper must feed the final payable total so the displayed product subtotal and payment total cannot drift.
- Website evaluates the best eligible delivery offer against the sum of delivery charges actually charged for the unique delivery dates, including mixed one-time and subscription checkout. Mobile must do the same: do not suppress delivery offer evaluation merely because subscription entries exist. Keep offer eligibility, best-offer selection, caps, and stacking rules otherwise unchanged.
- The undiscounted delivery total continues to come from Mobile's unique actual delivery-date calculation. For a delivery detail, allocate the already-calculated unique dates for display in Website order: distinct one-time dates first, then each subscription's dates in cart order excluding dates already charged. Show each non-empty group as per-delivery charge × number of charged dates and preserve the plan label. Display the original aggregate before the applied discount and the final aggregate in green only when `offerResult.deliverySavings > 0`; a merely eligible offer is not proof of an applied discount.
- When there is no applied delivery saving, show only the undiscounted charge, without a strike-through or discounted presentation. Never subtract a delivery saving more than once.
- Preserve existing order/cart prices, delivery-date resolution, unique-date charges, subscription reference savings, MRP savings, and payment/checkout behavior outside these corrected displayed totals and mixed-cart delivery-offer discrepancy.

Verified root causes before code changes: Mobile renders `totals.subtotal` (the pre-offer amount) as Product subtotal although `calculateCheckoutPayableTotal` already deducts the applied price offer; its offer selector sets eligible delivery amount to zero whenever subscriptions are present, unlike the Website; and its delivery UI has only an aggregate unique-date note, not the Website's one-time/subscription charge breakdown. UI strikethrough already depends on a positive calculated saving, and must remain so.

## Delivery charge row alignment — 2026-10-14

- Keep `Delivery charge` and its amount on one horizontal row: label on the left; on the right, the calculated original total and, only when an applied delivery saving is positive, original struck through followed by the green discounted total.
- Render the existing one-time/subscription unique-date breakdown immediately below that header row. Do not change date allocation, charge amounts, offer evaluation, or payable-total calculations.
- If no delivery saving was applied, show only the original charge on the right without strikethrough.
