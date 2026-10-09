# Phase 4 — Cart

## Status
Approved for implementation — 2026-10-05.

## Goal
Implement the Mobile Cart with the same customer mental model and business behavior as the current Website Cart, using native Mobile UI.

## Non-negotiable rules

1. Cart must not introduce a separate purchase flow from the Website.
2. A Product is the customer-facing cart identity.
3. For each Product, the Cart presents:
   - Packaging selector
   - One-time purchase option
   - Product-specific active subscription plans, when available
   - Quantity controls
4. Packaging is a dropdown/selector, not a grid of unrelated buttons.
5. One-time pricing comes from the selected Product selling option.
6. Subscription pricing comes from the selected Product's `subscriptionPlans` record and its matching subscription selling option `planPrice`.
7. Subscription plans are matched by `salableProductId` / Product ID. Never show another Product's plan.
8. The same Product must not create competing one-time and subscription cart entries when the customer changes purchase mode; selecting a mode replaces the cart selection for that Product, preserving quantity where possible.
9. Quantity is pack quantity, starting at 1. `+` increases quantity; `−` decreases it; quantity 1 can be removed.
10. Cart changes persist locally using the existing SQLite cart persistence.
11. Delivery charge is NOT calculated in Cart. It is calculated at Checkout from actual unique delivery dates.
12. Cart must NOT reserve or reduce inventory.
13. Cart must NOT call Website APIs for normal customer/cart operations.
14. The Cart screen must not show an order summary or delivery charge. It should show the product cart content and a single `Proceed to Checkout` action, matching the current Website behavior.
15. Mixed cart is supported: different Products may be one-time or subscription purchases in the same cart.
16. **Cart display order is stable.** Changing a Product between one-time and subscription must never move that Product to another position in the Cart. The mode switch replaces the purchase selection in place. New Products append to the end.
17. Cart order must persist across Cart reload/app restart and must not depend on which internal one-time/subscription array currently contains the Product.
18. Product/plan data should use the existing 1-day Product cache where applicable; subscription plans are loaded for the specific Product as needed.

## Cart item identity

- One-time: Product ID + selected selling option/packaging.
- Subscription: Product ID + plan ID + start date + selected subscription selling option/packaging.

## Cart screen structure

For each Product:

- Product image/name
- Packaging selector
- One-time purchase option
- Subscription plan options for that Product, only when configured and available for the selected packaging
- Quantity control
- Current line price

Bottom:

- `Proceed to Checkout`

No cart-level delivery charge or order summary.

## Website alignment reference

The current Website Cart groups cart entries by salable Product, derives Product selling options from `salesProducts.sellingOptions`, loads active subscription plans for that Product, and allows packaging, purchase mode, plan, and quantity changes from the Cart itself.

## Build/runtime correctness

- Cart persistence parsing uses the existing SQLite row iteration safely; invalid persisted JSON must be skipped without using `continue` outside a loop.
- Cart persistence must parse successfully with the Expo/Babel TypeScript parser before Phase 4 is considered runnable.
- Persisted-cart row parsing must use a loop construct when skipping invalid rows; `continue` is not permitted inside `forEach` callbacks.
- Conditional invalid-entry handling inside `forEach` must use `return` only when it means “skip this callback row”; do not use loop-only statements in callbacks.

## Validation before Phase 5

- One-time Product can change packaging and price updates.
- Subscription Product shows only its own plans.
- Subscription packaging/price follows the selected plan's selling option.
- Switching one-time/subscription replaces that Product's cart selection rather than creating duplicate competing entries.
- Quantity +/- works; quantity 1 can be removed.
- Mixed cart works with different Products.
- Cart has no order summary/delivery calculation.
- Proceed to Checkout opens Checkout with the current cart intact.

## Mode-switch implementation contract

Purchase-mode changes from Cart must use the store's `replaceProductCartSelection` action. This action must be implemented and exported by the store before Cart UI calls it. The operation is atomic from the customer perspective: remove any existing one-time/subscription selection for that Product, create the newly selected mode with the preserved quantity, persist the unified cart, and update the UI state. Cart UI must never call an undefined store action.

### Verification status (CI-22)
The current Mobile source already matches the required contract. `replaceProductCartSelection` removes the prior mode for the same Product, preserves the stable `cartPosition`, writes the unified cart back atomically, and the Cart screen groups/sorts by that position to keep the customer-facing order stable. This means the source is already compliant for CI-22 and does not require a functional patch unless a later refactor regresses the invariant.

## Cart ordering contract

The Mobile Cart has one customer-facing Product sequence even though persistence stores one-time and subscription entries separately. Each Product therefore carries a stable local `cartPosition` value.

- Adding a new Product assigns the next position.
- Switching one-time ↔ subscription preserves the Product's existing position.
- Changing packaging, plan, or quantity preserves the position.
- Removing a Product releases its position.
- Cart rendering groups by Product and sorts by `cartPosition`.
- Existing carts without `cartPosition` are assigned deterministic positions from their current persisted order during migration/load.
- The implementation must never rely on array concatenation (`oneTimeItems` followed by `subscriptionItems`) to determine customer-visible order.


## Subscription purchase entry

- The Product Detail subscription flow must capture the customer's selected Saturday start date before adding the subscription to Cart.
- Cart displays the selected subscription start date and must preserve it as part of the subscription cart identity.
- Subscription management is not a plan marketplace; available plans are selected from Product Detail, matching Website.
