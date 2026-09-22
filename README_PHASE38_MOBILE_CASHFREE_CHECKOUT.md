# Phase 38 — Mobile Cashfree Checkout

## Scope

Step 3 connects the existing Mobile checkout flow to the Website Cashfree backend bridge and native Cashfree React Native SDK.

Flow:

```text
Place Order
  ↓
Create pending order(s)
  ↓
Create Cashfree payment session
  ↓
Open Cashfree checkout
  ↓
Server-side payment verification
  ↓
Success / failure
```

## Implementation

- Existing `createCustomerMixedCheckout()` remains responsible for creating the Seedlings order/subscription records.
- Mobile collects the resulting order IDs.
- Mobile calls `POST /api/cashfree/create-payment-session` on the Website.
- The Website creates the Cashfree order and returns only the payment session information.
- Mobile opens the native Cashfree checkout using `react-native-cashfree-pg-sdk`.
- Cashfree callback is never treated as payment authorization by itself.
- Mobile calls `POST /api/cashfree/verify-payment`.
- Cart is cleared and the success screen is shown only when server verification returns `paid`.
- Failed/pending payments do not clear the cart and are not treated as successful payment.
- Cashfree client secret is never included in Mobile.

## Mobile environment

Add this public Mobile environment variable:

```env
EXPO_PUBLIC_WEBSITE_API_URL=https://YOUR-SEEDLINGS-WEBSITE-DOMAIN
```

For a physical Android device, this must be a URL reachable by the device. Do not use `localhost` unless the API is actually running on the Android device.

No Cashfree secret, client secret, webhook secret, or Firebase Admin private key is added to Mobile.

## Existing Website server environment

No new Website secret is required for Step 3. Step 2 server credentials remain server-side:

- `CASHFREE_ENVIRONMENT`
- `CASHFREE_CLIENT_ID`
- `CASHFREE_CLIENT_SECRET`
- `CASHFREE_WEBHOOK_SECRET`
- `CASHFREE_API_VERSION`
- Firebase Admin credentials

## Validation

Run:

```bash
npm install
npm run typecheck
```

Because this uses a native Cashfree module, rebuild the Android development build after JS/native dependency changes:

```bash
npx expo run:android
```

Do not use Expo Go for this Cashfree flow.
