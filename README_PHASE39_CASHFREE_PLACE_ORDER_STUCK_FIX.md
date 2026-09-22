# Phase 39 — Cashfree Place Order Stuck Fix

## Scope

Fixes the Mobile checkout state where tapping **Place Order** changes the button to **Placing Order…** but the payment flow does not visibly progress or return an error.

## Changes

- Added safe `[Cashfree]` stage logging around order creation, payment-session creation, SDK launch, callback, and server verification.
- Added a 30-second timeout to Mobile → Website Cashfree API requests.
- Added a native-platform guard so Cashfree is not attempted from Expo Go/web.
- Added a 120-second Cashfree callback timeout with a server-side status verification before reporting an unresolved payment.
- Preserved server-side payment verification as the source of truth.
- Cart is still cleared only after server verification returns `paid`.
- Payment/order/delivery/availability business logic was not changed.

## Environment

No new environment variable was introduced by Phase 39.

The existing Step 3 variable remains required:

```env
EXPO_PUBLIC_WEBSITE_API_URL=https://YOUR-SEEDLINGS-WEBSITE-DOMAIN
```

No Cashfree secret is stored in the Mobile app.
