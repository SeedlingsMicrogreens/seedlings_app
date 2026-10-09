# Seedlings Mobile — Phase 0 Foundation & Architecture

**Status:** Completed baseline decision for Mobile development
**Date:** 2026-10-05

## 1. Phase 0 Goal

Phase 0 locks the Mobile architecture and development boundaries before feature-by-feature implementation begins.

The objective is to prevent repeated architecture changes, accidental Website API dependencies, duplicated business rules, and payment/security regressions.

## 2. Applications

Seedlings has three applications:

```text
Customer Website
Admin Portal
Mobile App
```

Mobile is a customer-facing application.

Mobile does not become a second Website frontend. It has its own React Native/Expo implementation and UX while sharing the same Seedlings business data and approved business rules.

## 3. Mobile Data / Backend Boundary

Normal customer functionality must use the shared Firebase/Firestore architecture directly from Mobile, subject to the existing Firebase security model.

```text
                         Firebase / Firestore
                       /         |          \
                 Website       Admin       Mobile
                                             |
                                             +-- customer functionality
```

Mobile must NOT call Website APIs for normal customer functionality.

Normal customer Website API dependencies remain prohibited for:

- profile / profile photo
- addresses
- products
- packaging
- selling options
- cart
- availability
- production threshold
- delivery-date resolution
- orders
- subscriptions
- notifications
- feedback
- other normal customer data/business operations

**Authentication / OTP is an explicit server-side exception** documented in Section 5.

## 4. Approved Website API Exception

The existing Website backend is allowed only where trusted server-side payment processing is required.

Current approved payment endpoints are:

```text
POST /api/cashfree/create-payment-session
POST /api/cashfree/verify-payment
```

Flow:

```text
Mobile
  |
  | Firebase ID token
  v
Existing Website payment API
  |
  +--> Firebase Admin / Cashfree server-side processing
  |
  v
Payment result
```

Do not add unrelated Website endpoints to Mobile.

If a future requirement appears to need a Website API, stop and update the architecture MD before implementation.

## 5. Authentication Boundary

Authentication is an explicit, narrowly scoped server-side exception to the normal Firebase/Firestore Mobile data boundary.

The approved Final UAT architecture is:

```text
Mobile
   ↓
Authentication OTP API
   ↓
Generate/store/verify 4-digit OTP
   ↓
Demo? ── YES → return generated OTP for controlled demo
   │
   └── NO → server-side SMS provider
   ↓
Firebase Admin resolves/creates Firebase Auth identity
   ↓
Firebase Admin createCustomToken()
   ↓
Mobile signInWithCustomToken()
   ↓
Firebase Auth session
```

The authentication API is allowed because OTP generation/verification, SMS credentials and Firebase Admin custom-token creation require a trusted server boundary.

The authentication API is NOT a general Website API dependency.

Authentication rules are defined in:

`docs/MOBILE-AUTHENTICATION-DECISION.md`

The following are prohibited:

```text
Firebase Phone Authentication
Firebase-generated 6-digit OTP
signInWithPhoneNumber()
verifyPhoneNumber
PhoneAuthProvider
RecaptchaVerifier
Firebase Anonymous Auth as customer login
fixed 1234 OTP
Mobile-side OTP verification
direct Mobile-to-SMS-provider calls
```

## 6. Customer Business Identity

The shared customer business record remains:

```text
customers/{normalizedMobile}
```

Firebase UID is the authentication/session identity. It must not be treated as a replacement for the customer business key.

Existing customer records must not be overwritten merely because a different development Firebase session is created.

## 7. Business Rules Mobile Must Preserve

Mobile must preserve the established customer/business behavior for:

- Product and Microgreen terminology
- Packaging and gram-based quantities
- One-time orders
- Subscriptions
- Mixed carts
- Started-batch availability
- Production threshold fallback
- Full-quantity delivery
- No partial delivery
- No split delivery
- Delivery-date resolution
- Unique-date delivery charge
- Payment lifecycle
- Inventory lifecycle
- Order lifecycle
- Subscription lifecycle
- Notifications
- Feedback

### Production threshold

Threshold is a first-class order-acceptance rule and must be implemented before checkout.

```text
Started batch exists
    ↓
Use batch availability rules

No started batch
    ↓
Threshold fallback

Existing demand + requested quantity <= threshold
    ↓
Accept

Existing demand + requested quantity > threshold
    ↓
High-demand message + Send Enquiry
```

A started-batch shortage must continue the established next-date search rather than switching to threshold fallback.

## 8. Payment Boundary

Cashfree secrets and payment verification remain server-side.

Mobile must never contain:

- Cashfree secret key
- Cashfree webhook secret
- Firebase Admin credentials
- Firebase service-account private key
- other server-only credentials

Mobile may contain only the public/configuration values required by its SDKs and the approved payment API base URL.

## 9. Navigation Baseline

The current source contains these customer areas:

```text
Authentication
Home
Products
Product Details
Cart
Checkout
Orders
Order Details
Subscriptions
Delivery Calendar
Profile
Addresses
Notifications
Feedback
Wallet
About
```

The exact navigation should be refined feature-by-feature without breaking existing routes.

## 10. Current Source Audit — Phase 0

The latest Mobile baseline was inspected before implementation changes.

Confirmed:

- Existing Website API references are currently isolated to the approved Cashfree/payment service in the current source baseline.
- The authentication API is the approved shared Website + Mobile architecture. Implementation changes must follow the authentication decision and shared server contract.
- The payment service uses the approved Cashfree create-session and verify-payment endpoints.
- Normal customer services use Firebase/Firestore/local persistence rather than Website APIs.
- Firebase native and web client implementations are present.
- Cashfree SDK and its existing patch must be preserved.
- Existing cart persistence and account/session behavior must be preserved while parity work continues.

The baseline ZIP did not contain `.git`; no Git history is being reconstructed or invented.

## 11. Phase 0 Development Guardrail

An architecture boundary check is part of the Mobile project.

The check must fail if a Website API reference is introduced outside the approved payment service.

Before adding a new network/API integration:

1. Identify why a server-side operation is required.
2. Confirm it is not normal customer functionality that should use Firebase/Firestore.
3. Update the relevant MD first if the architecture changes.
4. Implement only after the MD is approved/current.
5. Run architecture validation and typecheck where dependencies are available.

## 12. Phase 0 Exit Criteria

Phase 0 is complete when:

- Mobile API boundary is documented.
- Payment exception is documented.
- Authentication boundary is documented.
- Customer identity model is documented.
- Threshold and availability are documented as core business rules.
- Navigation baseline is documented.
- Security boundary is documented.
- Architecture guardrail exists in the project.
- No general Website API dependency is authorized; authentication and payment remain explicit server-side exceptions.
- No implementation work has been started for Phase 1+ features.

## 13. Next Phase

After Phase 0, the next development phase is:

**Phase 1 — Customer Authentication**

Phase 1 must begin by updating the authentication MD if any authentication behavior/architecture is changing, then inspecting the latest source, then implementing.
