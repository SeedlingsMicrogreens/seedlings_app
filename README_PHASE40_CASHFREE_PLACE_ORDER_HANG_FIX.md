# Phase 40 — Cashfree Place Order Hang Fix

## Purpose
Fix the Mobile checkout state where `Place Order` changes to `Placing Order...` but no visible progress or error is shown.

## Changes
- Added visible checkout progress stage while the payment flow is running.
- Added timeout protection for Firebase ID-token refresh used by the payment API.
- Added timeout protection around live product refresh and availability pre-checks.
- If live product refresh times out but cached products exist, cached products are used only for the client-side pre-check; the existing Firestore order creation flow remains authoritative and revalidates products/availability before writing orders.
- Existing Cashfree server-side payment session and verification flow remains unchanged.
- No Cashfree secrets are stored in Mobile.
- No checkout pricing, delivery, availability, subscription, or order business rules were redesigned.

## Environment
No new environment variables were added.
Existing variable remains:
`EXPO_PUBLIC_WEBSITE_API_URL`

## Validation
Run locally:
```bash
npm install
npx expo start --clear
npx expo run:android
```
