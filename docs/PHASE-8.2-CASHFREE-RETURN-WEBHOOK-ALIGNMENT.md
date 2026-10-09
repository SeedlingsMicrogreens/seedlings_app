# Phase 8.2 — Cashfree Return + Webhook Alignment

## Scope

Fix the current Mobile Cashfree issue where payment completes in the native
Cashfree gateway but returning to the Mobile app shows:

`Cashfree order ID is required`

This phase is a payment recovery/return fix only. It does not change the
approved payment architecture or business rules.

## Approved architecture

```text
Mobile Checkout
   ↓
Pending business order(s)
   ↓
Website Cashfree create-payment-session API
   ↓
Cashfree Native SDK
   ├── Cashfree Webhook → Website Server → verify + idempotent finalization
   └── Mobile callback / return → Mobile asks Website Server for status
                                      ↓
                              server-authoritative result
```

Cashfree webhook processing remains the authoritative server-side finalization
path. Mobile callback/return must never independently mark an order paid.

Cashfree's current documentation confirms that the Mobile SDK callback provides
an order ID for server-side status verification, and that webhook verification
is required before webhook processing. The existing Website handover also
requires `/api/cashfree/webhook` to remain server-authoritative.

## Required fixes

1. Persist the Cashfree order ID before opening native Cashfree checkout.
2. Preserve that order ID when the SDK callback/return does not provide one.
3. When verifying payment, send the persisted Cashfree order ID to the Website
   verification API using the supported order-ID fields so the return path does
   not depend on a callback parameter being present.
4. Payment-status recovery must read the persisted attempt before attempting
   verification.
5. Do not treat the Mobile return/callback as payment authority.
6. Do not create another business order during return/recovery.
7. Do not clear the cart until the server reports the payment as paid.
8. Keep failed/pending payments recoverable.

## Definition of Done

- Cashfree opens successfully.
- Successful payment returns to the Mobile app without `Cashfree order ID is required`.
- Mobile obtains the persisted Cashfree order ID and asks the Website server for authoritative status.
- Website webhook remains responsible for server-side payment finalization.
- Successful payment clears the Mobile cart only after server confirmation.
- Failed payment keeps the cart for retry.
- Pending payment keeps the payment marker and does not create duplicate orders.
- No Firebase Functions are introduced.
- No additional Website API is introduced; the existing Cashfree verification endpoint is reused.
