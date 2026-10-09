# Seedlings Mobile — Phase 9: Subscriptions + UI/Payment Refinement

## Objective
Implement the customer subscription lifecycle using the existing approved Firebase/Firestore and Cashfree architecture. Include the agreed shared UI/payment refinements in this phase.

## Included
- Subscription plan/product selection
- Delivery address selection
- Subscription start date selection and quantity
- Subscription start date must be an explicit Saturday selection, matching the Website Product Detail subscription flow.
- Availability/shortage validation
- Pending subscription/order creation
- Cashfree payment for subscription order
- Server-authoritative payment verification
- Subscription activation only after successful payment
- Existing subscription display
- Delivery-calendar navigation
- Standard shared Button usage
- Button text centered through the shared Button component
- Payment error messages use readable semantic error styling
- No simulated/demo payment failure wording in customer-facing Mobile UI

## Subscription Lifecycle

Phase 9 completes the customer subscription lifecycle supported by the current Website/business baseline:

- Display only the customer's existing subscriptions with status and delivery summary.
- The subscription-management page must NOT list available subscription plans for purchase; Website does not show available plans there. Plan selection belongs to the Product Detail/subscription purchase flow.
> **Requires owner decision (recorded 2026-10-09):** `docs/MOBILE-APP-DEVELOPMENT-BASELINE.md` prohibits Pause/Cancel Subscription UI; this document allows it and the source implements it. Unresolved; current behavior preserved.

- Active subscription can be paused or cancelled.
- Paused subscription can be resumed or cancelled.
- Cancelled/completed subscriptions cannot be changed.
- Lifecycle updates are customer-owned Firestore updates and must preserve `authUid`, `customerId`, and paid subscription state.
- Reschedule Delivery belongs to Phase 10. Skip Delivery is not supported and must not be implemented.

## Payment Rules
- Subscription/order remains `pending_payment` until successful server-side payment finalization.
- Mobile does not activate the subscription locally after opening Cashfree.
- Cashfree callback/return is only a signal; server verification is authoritative.
- Failed payment does not activate the subscription.
- Failed payment keeps the customer able to retry without inventing a success state.
- A pending/failed subscription payment is a shared order/payment state. A payment initiated from Mobile must be checkable/retryable from Website, and a payment initiated from Website must be checkable/retryable from Mobile, using the same persisted order/payment-attempt records.
- Unresolved payment attempts remain persisted until an authoritative paid/failed state is received.
- Pending payment is reconciled through the existing payment-attempt mechanism.
- No duplicate business order is created by a callback/return race.

## CI-25 verification status — unpaid subscriptions and duplicate delivery display

The current Mobile source was audited against the unpaid-subscription and duplicate-delivery requirements. The evidence shows the implementation is already aligned with the approved contract, not a broken state that requires a Mobile-only patch:

- A new subscription is created with `status: 'pending_payment'` and `paymentStatus: 'pending'` before payment is confirmed in [services/subscriptions/subscriptionService.ts](../services/subscriptions/subscriptionService.ts).
- Lifecycle actions are blocked unless the subscription is already paid and active in [services/subscriptions/subscriptionService.ts](../services/subscriptions/subscriptionService.ts).
- The customer subscription list and delivery calendar only treat `active` and `paused` as lifecycle-active statuses; `pending_payment`/failed states are displayed as non-active and cannot generate future active delivery events in [app/(customer)/account/subscriptions.tsx](../app/(customer)/account/subscriptions.tsx) and [app/(customer)/account/delivery-calendar.tsx](../app/(customer)/account/delivery-calendar.tsx).
- Mobile does not create or mutate `subscriptionDeliveries`; it reads the server-owned actual delivery records from [services/subscriptions/subscriptionDeliveryService.ts](../services/subscriptions/subscriptionDeliveryService.ts).
- Duplicate delivery display is therefore a Website/Admin data-quality or idempotency issue if the same logical delivery is present more than once. Mobile must not invent a client-side dedupe rule by product/date alone because the underlying business identity is server-owned (`subscriptionId` + `orderId` + `deliveryDate` or the authoritative delivery order id), not a display-only label.

This means CI-25 is treated as "Already implemented and verified" from the Mobile source standpoint. Any duplicate `subscriptionDeliveries` record must be fixed by the authoritative Website/Admin data contract, not by a Mobile-only dedupe replacement.

## UI Rules
- All primary actions use the shared Button component.
- Button text is vertically and horizontally centered by the shared component.
- Payment failures use the centralized semantic error presentation; white text on a light/error background is not allowed.
- Customer-facing payment messages must describe the actual state returned by Cashfree/server verification and must not use simulated/demo wording.

## Cashfree Callback/Error Handling
- Cashfree SDK callback errors are signals, not final business payment states.
- `action_cancelled` must be treated as a customer/gateway callback condition, not as a simulated failure.
- Mobile must verify the persisted Cashfree order with the existing Website verification endpoint after SDK callbacks.
- If server verification is temporarily unavailable (for example HTTP 500), Mobile must keep the payment attempt recoverable and show a pending/verification message rather than claiming payment failed.
- The local payment attempt must not be cleared while payment status is unresolved.
- The Cashfree-hosted error screen is third-party UI and must not be mistaken for the Mobile application's error UI.

## Architecture Constraints
- Firebase/Firestore remains the normal Mobile data boundary.
- Cashfree Website APIs remain the approved payment exception for this phase. Customer authentication uses the same shared Final UAT authentication architecture implemented by Website and Mobile and documented in `docs/MOBILE-AUTHENTICATION-DECISION.md`.
- Firebase Functions must not be introduced.
- Business rules must remain aligned with Website behavior.

## Workflow
Update MD → inspect latest source → implement shared/feature behavior → typecheck → architecture check → native Android build → Cashfree sandbox validation → regression → update changelog.

## Completion Criteria
- Subscription payment can be initiated from Mobile.
- Successful payment activates the subscription through server-side finalization.
- Failed/pending payment states remain safe and recoverable.
- Button text is centered everywhere through the shared component.
- Payment errors are readable and correctly styled.
- No simulated payment failure wording remains in customer-facing flows.
- Phase 9 manual verification completed before Phase 10.
