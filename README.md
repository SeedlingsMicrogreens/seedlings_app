# Seedlings Microgreens Mobile

Customer mobile application for Seedlings Microgreens.

## Required documentation before Mobile development

Read these documents before implementing or changing customer functionality:

1. `DEVELOPMENT-RULES.md` — permanent Mobile development and non-regression rules.
2. `docs/MOBILE-CROSS-APP-SOURCE-OF-TRUTH.md` — how Mobile, Website and Admin sources are used together.
3. `docs/reference/WEBSITE-CURRENT-STATE.md` — current Website customer behaviour and UX/business rules.
4. `docs/reference/ADMIN-CURRENT-STATE.md` — current Admin operational, data, production, inventory, fulfilment and delivery rules.

## Mobile parity principle

When a customer feature already exists on the Website, Mobile must implement the same business behaviour and outcomes. Native/mobile UI may differ where appropriate, but Mobile must not invent a separate business rule.

Admin rules remain the operational/data reference wherever Mobile functionality touches production, inventory, fulfilment, delivery or shared Firestore data.

## Documentation rule

Keep the documentation set compact. Do not create `README_PHASE*.md` files for normal feature development. Update the current-state/reference documents and `CHANGELOG.md` when a permanent cross-application decision changes.

`.git` is preserved in the project repository.

## Customer Authentication

Customer authentication follows `docs/MOBILE-AUTHENTICATION-DECISION.md`.

The approved Final UAT flow is server-controlled 4-digit OTP authentication:

```text
Mobile
  ↓
Authentication OTP API
  ↓
4-digit OTP generation / verification
  ↓
Demo → generated OTP returned for controlled display
Real  → server-side SMS
  ↓
Firebase Admin createCustomToken()
  ↓
Mobile signInWithCustomToken()
  ↓
Firebase Auth session
```

The following are not used:

- fixed `1234`
- 6-digit OTP
- Firebase Phone Authentication
- `signInWithPhoneNumber()`
- `RecaptchaVerifier`
- Firebase Anonymous Auth as the customer-login mechanism
- direct SMS provider access from Mobile

`EXPO_PUBLIC_WEBSITE_API_URL` remains available for existing server-side payment APIs and, for Final UAT authentication, the approved authentication API boundary. It must never contain SMS credentials or Firebase Admin credentials.

See:

- `docs/MOBILE-AUTHENTICATION-DECISION.md`
- `docs/PHASE-1-CUSTOMER-AUTHENTICATION.md`
- `docs/MOBILE-FIREBASE-AUTH-SETUP.md`

## Mobile Development Baseline

The approved Mobile scope and architecture guardrails are defined in:

`docs/MOBILE-APP-DEVELOPMENT-BASELINE.md`

Key rule: Mobile must not use Website APIs for normal customer functionality. The existing Website backend/API remains an approved dependency for Cashfree/payment processing and the shared Final UAT authentication API.

## Mobile architecture boundary

Mobile does not use Website APIs for normal customer functionality. Products, cart, availability/threshold, checkout data, orders, subscriptions, notifications, profile and feedback use the shared Mobile/Firebase architecture. The existing Website backend remains an approved dependency for Cashfree/payment processing and the shared Final UAT authentication API.

See `docs/PHASE-0-FOUNDATION-ARCHITECTURE.md`.


### Current Phase Documentation
- Phase 2 Home: `docs/PHASE-2-HOME.md`
- Phase 14 UX + Functional Implementation Audit: `docs/PHASE-14-UX-IMPLEMENTATION-AUDIT.md`

## Phase 5 availability
Mobile availability and production-threshold checks use direct Firebase/Firestore. The Website production-threshold API is not used. High-demand failures stop checkout and can submit an enquiry directly to the shared `enquiries` collection.

## UI/UX Standardization

The UI/UX standardization phase is defined by `docs/PHASE-8-UI-UX-STANDARDIZATION.md`; the mandatory UI standard (React Native `StyleSheet` + theme tokens + shared components, no NativeWind/Tailwind) is in `DEVELOPMENT-RULES.md`. Baseline status: PHASE-8 §16.
Shared UI primitives and centralized layout tokens should be reused for future screens and maintenance changes.


### Phase 10 delivery API exception
Mobile may call the existing `/api/subscriptions/delivery-action` endpoint only for authenticated subscription reschedule actions. Skip Delivery is not supported. All other normal customer data remains Firebase/Firestore direct.


## Phase 11 Status

Phase 11 — Profile + Addresses + Profile Photo is implemented using the MD-first specification at `docs/PHASE-11-PROFILE-ADDRESSES-PHOTO.md`. Profile photo uses authenticated Firebase Storage; existing address CRUD/default behavior is preserved.

## UAT-5 implementation status
The UAT-5 implementation removes customer-initiated Skip Delivery, and aligns the checkout summary with the locked presentation. (Status correction 2026-10-09: the claimed shared Button full-surface/centering fix was not present in the audited source; see `docs/PHASE-8-UI-UX-STANDARDIZATION.md` §16.) Rescheduling remains supported. Authentication and payment business rules are unchanged. Run `npm ci`, `npm run typecheck`, `npm run check:architecture`, and `npx expo run:android` before release; this archive has not been validated with a complete Android build in this environment.
