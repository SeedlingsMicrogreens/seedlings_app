# Phase 6 — Checkout

## Status
Implemented — visual alignment refinement 2026-10-05.

## Goal
Implement the Mobile Checkout review flow using the resolved delivery dates from Phase 5, with the same customer-facing business behavior as the current Website Checkout.


## Locked Website-aligned checkout presentation

This section supersedes earlier Mobile checkout presentation notes in this file. Do not restore the previous MRP-led summary. Match the latest approved Website checkout layout and displayed values.

- Group purchase rows by One-time purchases and subscription purchases where applicable.
- Each row shows product name, packaging/weight, quantity, payable selling price and the resolved first/next delivery date. Do not add an MRP line or MRP-based savings row to the checkout summary unless the current approved Website checkout explicitly displays that same row.
- Use one compact price summary: product subtotal after applicable product offers, offer savings only when actually applied and not duplicated, one Delivery charge row, and Grand total. Do not add a separate MRP total or duplicate savings messages.
- Delivery charge includes the unique-date explanatory note when applicable.
- Apply the same configured price/delivery offers and payable total as Website. Do not invent offer names or savings values.
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
