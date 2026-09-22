# Phase 36 — Mobile Cashfree SDK Foundation

## Scope

This phase only prepares the mobile app for Cashfree Payment Gateway integration. It does **not** change checkout, order creation, payment status handling, cart behavior, or navigation.

## Changes

- Added `react-native-cashfree-pg-sdk` version `2.4.0`.
- Added Cashfree environment configuration to Expo app config:
  - `extra.cashfree.environment = "sandbox"`
- Kept all payment business logic unchanged.
- No Cashfree client ID, client secret, or other credentials are stored in the mobile app.
- No payment session is created and no payment is started in this phase.

## Native build requirement

Cashfree's React Native SDK contains native Android/iOS code, so it cannot be exercised through the standard Expo Go runtime. A native development build is required.

After extracting this ZIP, run:

```bash
npm install
npx expo run:android
```

If the project already has generated native directories, regenerate them after adding the native dependency if needed:

```bash
npx expo prebuild --clean
npx expo run:android
```

For day-to-day JavaScript/TypeScript changes after the native build is installed:

```bash
npx expo start
```

## Validation boundary

Step 1 is complete when:

1. `npm install` succeeds.
2. The Cashfree native package is autolinked into the Android build.
3. `npx expo run:android` builds and installs the app.
4. The existing app opens normally.
5. Existing checkout behavior remains unchanged.

The actual Cashfree payment-session creation and checkout invocation are intentionally deferred to Step 2.
