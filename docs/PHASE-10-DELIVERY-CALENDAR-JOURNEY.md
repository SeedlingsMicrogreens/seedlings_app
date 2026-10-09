# Seedlings Mobile — Phase 10 Delivery Calendar / Journey

**Current decision (2026-10-09): Reschedule-only. This supersedes all historical Skip Delivery wording.**

## Objective
Implement the customer Delivery Calendar and Delivery Journey using the approved Website behavior and Mobile architecture.

## Scope
- Calendar of actual and future virtual subscription deliveries.
- Month navigation and delivery status display.
- Delivery Journey/progress summary.
- Reschedule an eligible upcoming delivery only.
- Customer ownership/security validation and standard Mobile UI.

## Architecture
Normal customer reads use Firebase/Firestore directly. Rescheduling uses the existing narrowly-scoped Website API exception because it requires the Website server transaction/Admin SDK:

`POST /api/subscriptions/delivery-action`

Cashfree remains the payment API boundary. No Firebase Functions are introduced. Mobile never contains Firebase Admin credentials.

## Approved behavior
- Delivery day is Saturday.
- Future subscription deliveries may be virtual until `subscriptionDeliveries` records exist.
- Past/actual delivery records are read from `subscriptionDeliveries`.
- Reschedule moves an eligible upcoming delivery to a later Saturday within the subscription period.
- Past deliveries cannot be changed.
- Reschedule is available only for active, paid subscriptions and is validated by the server for ownership, date, schedule and delivery state.
- Skip Delivery is not supported: no button, menu item, handler, action type, API request or new skipped state may be introduced. Historical records, if present, may be displayed safely but cannot enable a new skip action.

## Mobile UX
- Calendar opens on the current month and supports previous/next month navigation.
- Upcoming, actual/delivered and rescheduled states are visually distinct.
- Eligible upcoming delivery offers Reschedule only.
- Reschedule requires selecting a later Saturday and confirming the action.
- Errors use a visible, accessible shared error presentation. No empty toast/white notification bar may be rendered.
- Journey shows delivery progression and next delivery.

## Security
- Firebase ID token is sent to the existing reschedule API.
- Mobile never uses Admin credentials.
- Mobile does not directly create or modify `subscriptionDeliveries`.

## Completion criteria
- Calendar shows actual and virtual deliveries correctly.
- Reschedule works through the existing server transaction and refreshes the calendar.
- No active Skip Delivery UI/action remains.
- Journey reflects the latest delivery state.
- Existing subscription/payment/order behavior remains unchanged.

## CI-25 verification status — unpaid subscriptions and duplicate delivery identity

The current Mobile implementation does not exhibit the unpaid-subscription activation bug or a client-side duplicate delivery bug. The app deliberately keeps a new subscription in `pending_payment` until the authoritative server verification marks it paid, and the delivery calendar only builds future deliveries for `active` and `paused` subscriptions. Actual delivery records remain server-owned in `subscriptionDeliveries`, and Mobile does not create these records itself. If a duplicate logical delivery appears in the dataset, the idempotency fix belongs to the Website/Admin source of truth, not Mobile UI-only deduplication.

## Reschedule Parity Clarifications — 2026-10-09
- Today and past delivery dates are not customer-reschedulable in Mobile.
- Mobile presents only valid later Saturday options within the subscription period, capped to the two nearest eligible options to match the current Website flow.
- Tapping a new date must show a confirmation prompt before calling the Website delivery-action API.
- Subscription demand must remain represented after Admin generates an order for a subscription delivery. Customer availability counts generated, paid subscription orders for a delivery date unless the same subscription is already counted through `subscriptions.nextDeliveryDate` for that date.
- Server-side replacement-delivery generation after reschedule is owned by the Website/Admin delivery-action and fulfilment code. Mobile does not directly create or mutate `subscriptionDeliveries`.
- Android build and representative physical-device verification completed.

## CI-26 verification status — calendar status and order journey

The current Mobile implementation reflects persisted order/delivery state rather than inventing a new status model. The source evidence shows the status mapping is already compliant:

- The customer order detail screen displays `order.status` and `order.deliveryStatus` directly from the stored order snapshot and formats unknown values safely in [app/(customer)/order/[id].tsx](../app/(customer)/order/[id].tsx).
- The delivery calendar only counts future subscription deliveries for `active` and `paused` subscriptions and reads actual delivery history from the server-owned `subscriptionDeliveries` collection in [app/(customer)/account/delivery-calendar.tsx](../app/(customer)/account/delivery-calendar.tsx) and [services/subscriptions/subscriptionDeliveryService.ts](../services/subscriptions/subscriptionDeliveryService.ts).
- Order history and delivery journey values are taken from persisted data rather than local inference, which prevents stale or fabricated progress in [docs/PHASE-8-ORDERS.md](../docs/PHASE-8-ORDERS.md).
- Unknown or missing statuses remain safe because the UI falls back to a readable label instead of a broken status branch. This is a display-safe behavior, not a business-rule mutation.

Any status mismatch in a specific production dataset remains a server/Admin data issue rather than a Mobile-only status bug. Mobile should continue to show the stored business state and not infer or override it.

## Workflow
Update MD → inspect latest Mobile/Website source → implement → typecheck/build → Android verification → regression → update changelog.
