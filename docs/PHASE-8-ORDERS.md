# Phase 8 — Orders + Order Details

## Status
Implemented — 2026-10-07.

## Goal
Provide the Mobile customer with a Website-aligned **My Orders** and **Order Details** experience using the existing shared Firestore `orders` collection.

Mobile remains native React Native/Expo. Website is the functional/business reference; no Website API is introduced for normal order reads.

## Scope

### My Orders
- Load the authenticated customer's orders from `orders`.
- Scope reads to the current customer's normalized mobile number.
- Sort newest orders first.
- Show:
  - Order number
  - Current order status
  - Product summary
  - Item count
  - One-time/subscription type
  - Order amount
  - Order date
  - Delivery date
  - Delivery status when stored
  - Payment status
- Filters:
  - All
  - One Time
  - Subscription
  - Past

### Order Details
- Verify the requested order belongs to the authenticated customer before displaying it.
- Show the stored order snapshot; do not re-read current Product/Subscription masters to replace historical values.
- Show:
  - Order number and created date
  - Products
  - Packaging/weight and quantity
  - Line prices
  - Delivery date
  - Delivery status when stored
  - Delivery address snapshot
  - Product total
  - Stored savings/discount
  - Delivery charge
  - Final total
  - Payment method/status
  - Transaction information when stored
  - Payment transactions when stored
  - Status history when the order contains a `statusHistory` array
  - Retry Payment for recoverable `pending_payment` / `payment_failed` orders, reusing the existing order id

## Data and security rules

1. Orders are read from the shared Firestore `orders` collection.
2. Mobile must not call a Website order API.
3. An order is displayed only when `order.customerId` matches the current normalized customer mobile.
4. Historical order values come from the order's stored snapshots.
5. Order reads never modify inventory, payment state, subscriptions, or fulfilment.
6. Pending/failed payment state is displayed as stored. A retry must reuse the existing order id and the stored payment-attempt/order state; it must not create a duplicate business order.
7. Status history is displayed only when actually stored. Mobile must not fabricate historical status timestamps/events.
8. Delivery date/status are displayed from stored order fields.
9. No Pause Subscription, Cancel Subscription, or Skip Delivery controls are introduced in Orders.

## Multi-Date Order Contract

Checkout may produce more than one one-time order for a single customer payment attempt when one-time cart items resolve to different delivery dates. Order History and Order Details display each stored order independently. This is intentional so Admin delivery assignment, demand, and fulfilment see the correct `scheduledDeliveryDate` for every item.

## Manual verification

1. Login and open My Orders.
2. Orders are listed newest first.
3. Only the logged-in customer's orders are visible.
4. All / One Time / Subscription / Past filters work.
5. Open an order and verify order number/status/date.
6. Verify all product lines show stored product name, packaging/weight and quantity.
7. Verify delivery date and address snapshot.
8. Verify product total, savings, delivery charge and final total.
9. Verify payment status/transaction details when present.
10. If `statusHistory` exists, verify only stored events are shown.
11. Verify a different customer's order ID cannot be opened.
12. Confirm opening Orders does not change inventory, payment, subscription or fulfilment data.

### Runtime validation correction — 2026-10-07
- The earlier `documentId()` wrapper export did not reliably resolve the native React Native Firebase runtime path.
- Phase 8.1 removes that runtime dependency from checkout availability lookup and fetches the required documents directly by document reference instead.
- This preserves the same product/sales-product lookup behavior while eliminating the failing native `documentId()` call from the Continue to Payment path.

## Validation limitation

The supplied ZIP does not contain installed `node_modules` or live Firebase credentials. Therefore a full Expo build/typecheck cannot be claimed from the ZIP alone. Run:

```bash
npm install
npm run typecheck
npm run check:architecture
```

Then perform the manual verification above against the configured Firebase project.
