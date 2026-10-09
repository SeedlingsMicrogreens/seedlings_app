# Phase 7 — Cashfree Payment + Callback Reconciliation

## Status
Implemented on 2026-10-05 from the Mobile Phase 6 baseline; Checkout visual alignment refinement documented 2026-10-05.

## CI-10 / CI-11 audit status

- CI-10 (payment retry, idempotency, duplicate-order prevention): Already implemented and verified on the Mobile side. The app reuses a persisted payment attempt, limits the payment flow to a single active attempt, deduplicates order IDs before creating a Cashfree session, and verifies the authoritative backend status before treating the payment as paid or failed.
- CI-11 (server-authoritative pricing, amount, and availability validation): Partially fixed on Mobile and still blocked by the server/API dependency. Mobile may re-check availability and compare the Cashfree session amount against the pending order total, but the final pricing/availability decision remains authoritative on the Website backend and its verification endpoints.

The Mobile app must never treat callback-only success, callback timeout, or a locally cached total as the final payment truth. A final `paid`/`failed` decision always requires the server-side verification response.

## Goal
Implement the Website-aligned Cashfree payment lifecycle for Mobile while keeping payment authority on the existing Website backend/payment APIs.

## Non-negotiable rules

1. Mobile never receives or stores Cashfree secret credentials.
2. The existing Website Cashfree/payment API is the approved payment exception. Customer authentication uses the shared Final UAT authentication architecture implemented by both Website and Mobile.
3. Payment success is server-authoritative; the native Cashfree callback is not sufficient by itself.
4. Checkout creates a single payment attempt over the complete mixed cart and records the order IDs used by that attempt.
5. One-time and subscription order records are created as pending-payment records before Cashfree starts, because the existing Cashfree session API accepts order IDs.
6. Subscription records remain `pending_payment` until successful payment finalization; they must not become active merely because payment was opened.
7. Successful payment must be finalized server-side through the existing Cashfree callback/verification lifecycle.
8. A successful payment must result in confirmed order state and subscription activation where applicable.
9. Local Mobile cart is cleared only after server-side payment status is confirmed as `paid`.
10. If the app is closed during/after payment, the pending payment marker is reconciled when the customer returns/reopens the app. If the server says `paid`, the cart is then cleared without requiring another payment.
11. Failed payment must not reduce inventory and must keep the cart available for retry.
12. Pending/unknown payment must not create another business order. The existing pending payment attempt is reconciled first.
13. Retry after a failed/pending payment must reuse the existing order IDs when possible; duplicate business orders are not allowed for one payment attempt.
14. Double taps are prevented by the checkout UI and payment-attempt lock.
15. SDK callback `onVerify`/`onError` always triggers server-side verification before Mobile decides success/failure.
16. Callback timeout triggers server-side status verification.
17. Returning to the app is not required for server order placement/finalization.
18. The Checkout total passed to Cashfree must match the server-created pending order total.
19. Delivery charge uses the Phase 6 unique actual delivery-date calculation. Subscription plan delivery-charge overrides are not used.
20. Checkout displays only the first/next subscription delivery date; future dates remain internal.

## Payment flow

```text
Checkout
  ↓
Revalidate cart + address + availability
  ↓
Create pending one-time/subscription order records
  ↓
Create Cashfree payment session using order IDs
  ↓
Open Cashfree native SDK
  ↓
Cashfree callback OR app return OR callback timeout
  ↓
Server-side payment verification/finalization
  ├── PAID → confirm order + activate subscription + commit inventory → Mobile clears cart
  ├── FAILED → keep cart → allow retry
  └── PENDING → keep cart + pending payment marker → reconcile later
```

## App-closed recovery

Mobile persists a small local payment-attempt marker containing only the Cashfree order ID, business order IDs and customer-safe display data. On the next authenticated app startup, Mobile checks the marker with the existing server verification endpoint.

- `paid` → clear local cart and remove marker.
- `failed` → keep cart and remove marker so a new retry can be started.
- `pending` → keep marker and do not create duplicate orders.
- verification/network failure → keep marker and retry on a later authenticated startup/focus.

The local marker is not the source of payment truth.

## Manual verification required

1. Start payment with one-time item; Cashfree opens.
2. Successful payment → order is confirmed and cart is cleared.
3. Successful payment while app is backgrounded/closed → reopen app; server status is reconciled and cart clears without paying again.
4. Failed payment → order is not confirmed, inventory is not reduced, cart remains.
5. Pending payment → no duplicate order; payment marker remains.
6. Retry a failed payment → no duplicate business order is created.
7. Double-tap Continue to Payment → only one payment attempt/order set is created.
8. Mixed one-time + subscription payment → correct total and all related records finalize together.
9. Subscription is not active before successful payment.
10. Subscription becomes active only after successful payment finalization.
11. Cashfree callback is not required for the app to remain recoverable; server status is authoritative.
12. Callback/return race does not create duplicate orders.
13. Cart remains when payment is failed/pending and is cleared only after `paid` is confirmed.
14. Checkout still shows only the first subscription delivery date.

## Validation limitation

The Mobile ZIP does not contain installed `node_modules`, Firebase credentials, or Cashfree sandbox configuration. Therefore a full Expo build/payment test cannot be claimed from the ZIP environment. Run `npm install`, `npm run typecheck`, `npm run check:architecture`, and a native Cashfree sandbox test in the user's configured environment.


## Cross-Platform Payment Continuity

Payment state is shared through the same persisted order/payment-attempt records. A customer may start payment on Mobile and later open Website to check status or retry; the reverse is also required. Neither platform may maintain a private payment truth. Pending, failed, paid and unresolved states must be reconciled against the same server-authoritative Cashfree/order records.
