# Seedlings Website + Mobile — Shared Customer Flow Baseline

**Status:** Approved Final UAT architecture baseline  
**Updated:** 2026-10-08

Website is the behavioral reference for established customer-facing business flows. Mobile uses native UI but must match the Website behavior and shared data contracts.

## Authentication

Both platforms use the same server-controlled 4-digit OTP authentication:

```text
Website ─┐
         ├─→ Authentication API
Mobile  ─┘       ↓
            Generate/verify OTP
                 ↓
          Firebase Admin identity
                 ↓
          createCustomToken()
                 ↓
          Platform Firebase session
```

A customer must have the same business identity and Firebase UID regardless of platform.

## Payment Continuity

Payment state is shared through the same persisted orders/payment attempts.

```text
Mobile starts payment
        ↓
shared order/payment record
        ↓
Website can check/retry
```

and:

```text
Website starts payment
        ↓
shared order/payment record
        ↓
Mobile can check/retry
```

Rules:

- `pending_payment` remains recoverable.
- `payment_failed` remains retryable.
- Authoritative payment verification is server-side.
- No platform-local payment truth may diverge from the shared order/payment state.
- Retrying an existing payment must not create a duplicate business order.
- Check-payment must reconcile against the same Cashfree/order records.

## Subscription Purchase

- Product Detail is the subscription purchase entry point.
- Available plans are shown for the selected Product.
- Customer selects the subscription plan, selling option/packaging, quantity and Saturday start date.
- The Subscription management page shows only the customer's existing subscriptions; it does not list available plans for purchase.
- The selected start date must be preserved through Cart, availability resolution, Checkout and order creation.

## Checkout

Mobile must match current Website behavior for:

- product/packaging presentation
- MRP/selling-price semantics
- configured offers
- savings
- delivery-charge calculation
- resolved delivery dates
- payment total

The exact native visual layout may differ, but business behavior and displayed pricing must not diverge.

## Feedback

Website and Mobile use the shared `orderFeedback` data contract. Mobile-only image upload is allowed as an extension, but feedback must remain visible and compatible across platforms.

## Non-goals

This document does not authorize general Website API usage from Mobile. Authentication and payment remain explicit server-side exceptions.
