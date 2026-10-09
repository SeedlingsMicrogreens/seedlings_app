# Seedlings Mobile — Phase 1 Customer Authentication

**Status:** Architecture updated for Final UAT; implementation pending  
**Updated:** 2026-10-08

## Implementation Status

Mobile implementation is now wired to the approved authentication API contract:

- `POST /api/customer/auth/send-otp`
- `POST /api/customer/auth/verify-otp`
- Demo OTP is accepted only from the server response.
- Successful verification signs the Mobile client in with `signInWithCustomToken()`.
- Firebase Phone Authentication and local fixed-OTP verification are removed from the Mobile implementation.
- The same authentication API is implemented by Website and consumed by Mobile. Both platforms use the same customer mobile identity and Firebase UID so authentication is interchangeable across platforms.

## 1. Goal

Provide a stable customer authentication flow using a **server-controlled 4-digit OTP** and Firebase Custom Token authentication.

Phase 1 must remove the previous fixed OTP/Firebase Phone Authentication architecture.

## 2. Approved Architecture

```text
Customer enters mobile number
            ↓
       Validate mobile
            ↓
        Send OTP
            ↓
     Authentication API
            ↓
   Generate 4-digit OTP
            ↓
      Demo enabled?
        /          \
      YES           NO
       ↓             ↓
Return OTP       Send server-side
for demo         SMS
       \             /
        \           /
         ↓         ↓
          OTP Screen
              ↓
        Enter 4-digit OTP
              ↓
         Verify OTP API
              ↓
        Server validates
              ↓
       Resolve/create
       Firebase identity
              ↓
 Firebase Admin custom token
              ↓
Mobile signInWithCustomToken()
              ↓
       Firebase session
              ↓
             Home
```

## 3. Authentication API Boundary

Authentication is an approved server-side API exception.

```text
Mobile
   ↓
Authentication OTP API
   ↓
OTP generation / verification
   ↓
Firebase Admin
   ↓
SMS provider when Demo OTP = false
```

Mobile must not call the SMS provider directly.

Mobile must not contain SMS credentials or Firebase Admin credentials.

The existing Cashfree/payment API exception remains separate.

## 4. OTP Rules

- OTP is exactly 4 digits.
- Valid range is `0000` to `9999`.
- Every Send OTP generates a new OTP.
- Every Resend generates a new OTP.
- Previous OTP becomes invalid after a new OTP is generated.
- OTP expiry is controlled by the server.
- OTP verification is controlled by the server.
- Successful OTP verification consumes the OTP.
- Expired, incorrect, previous, consumed or invalid OTP is rejected.
- Mobile UI countdown is not the security authority.
- Fixed `1234` is not used.

## 5. Demo OTP Flow

```text
Mobile number
    ↓
POST /api/customer/auth/send-otp
    ↓
Server generates new 4-digit OTP
    ↓
Store OTP + expiry
    ↓
Return generated OTP
    ↓
SweetAlert displays generated OTP
    ↓
Customer enters OTP
    ↓
POST /api/customer/auth/verify-otp
    ↓
Server validates OTP
    ↓
Firebase custom token
    ↓
Mobile signInWithCustomToken()
```

Demo mode uses the same API contract as Real mode.

The generated OTP must be dynamic on every request.

## 6. Real SMS Flow

```text
Mobile number
    ↓
POST /api/customer/auth/send-otp
    ↓
Server generates new 4-digit OTP
    ↓
Store OTP + expiry
    ↓
Server sends SMS
    ↓
Customer enters OTP
    ↓
POST /api/customer/auth/verify-otp
    ↓
Server validates OTP
    ↓
Firebase Admin createCustomToken()
    ↓
Mobile signInWithCustomToken()
```

The real OTP must never be returned to Mobile.

## 7. Firebase Session

After successful OTP verification:

1. Server resolves the customer using normalized mobile number.
2. Server resolves the existing Firebase Auth UID.
3. If no usable Firebase identity exists, server creates it.
4. Firebase Admin creates a custom token.
5. Mobile receives the custom token.
6. Mobile calls `signInWithCustomToken()`.
7. Firebase establishes the authenticated session.

Firebase Phone Authentication and Anonymous Auth are not part of this flow.

## 8. Customer Identity

The business identity remains:

```text
customers/{normalizedMobile}
```

The Firebase UID remains the authentication/session identity.

Existing customer `authUid` / `authUids` ownership behavior must be preserved.

Authentication migration must not create duplicate customer records or replace an existing Firebase identity unnecessarily.

## 9. Authentication UI

Use the canonical shared Button component for:

- Send OTP
- Verify OTP
- Resend OTP

OTP screen must provide:

- four OTP cells
- loading state
- error state
- resend
- countdown/expiry indicator
- Demo OTP SweetAlert
- no 6-digit OTP UI

No screen-specific button implementation is allowed.

## 10. Prohibited Authentication Mechanisms

The following are explicitly prohibited:

```text
Firebase Phone Authentication
signInWithPhoneNumber()
verifyPhoneNumber
PhoneAuthProvider
RecaptchaVerifier
Firebase-generated 6-digit OTP
Firebase Anonymous Auth for customer login
fixed 1234 OTP
Mobile-side OTP verification
direct SMS provider calls from Mobile
SMS credentials in Mobile
Firebase Admin credentials in Mobile
```

Approved Firebase sign-in:

```text
signInWithCustomToken()
```

## 11. Session Restoration

After Firebase Custom Token sign-in, normal Firebase Auth session restoration remains the source for determining whether the customer is authenticated.

Existing customer ownership checks must continue to use the authenticated Firebase UID together with the normalized customer identity.

Logout must continue to clear the Firebase authenticated session normally.

## 12. Validation / Exit Criteria

Phase 1 authentication is complete only after:

### OTP

1. OTP is always exactly 4 digits.
2. Send OTP generates a new OTP.
3. Resend generates a new OTP.
4. Previous OTP fails after resend.
5. Demo mode displays the generated OTP through SweetAlert.
6. Demo mode never uses fixed `1234`.
7. Real mode never returns the OTP to Mobile.
8. Expired OTP is rejected.
9. Wrong OTP is rejected.
10. Correct OTP succeeds.
11. Consumed OTP cannot be reused.

### Firebase

12. Firebase Phone Authentication is never invoked.
13. Anonymous Auth is not used as the customer-login mechanism.
14. Server creates the Firebase custom token.
15. Mobile signs in using `signInWithCustomToken()`.
16. Existing Firebase customer identity is preserved.
17. Logout remains functional.
18. Session restoration remains functional.

### UI

19. Send OTP uses the shared Button.
20. Verify OTP uses the shared Button.
21. Resend OTP uses the shared Button.
22. Buttons have the standardized visible/pressed/loading/disabled states.
23. No 6-digit OTP UI is displayed.

### Security

24. SMS credentials remain server-side.
25. Firebase Admin credentials remain server-side.
26. Mobile never calls the SMS provider directly.
27. Real OTP is never exposed through the Mobile API response.
28. OTP expiry and consumption are server-authoritative.

## 13. Documentation-First Gate

Before implementation:

1. This document must remain aligned with `docs/MOBILE-AUTHENTICATION-DECISION.md`.
2. `docs/PHASE-0-FOUNDATION-ARCHITECTURE.md` must allow the authentication API exception.
3. `docs/MOBILE-APP-DEVELOPMENT-BASELINE.md` must allow the authentication API exception.
4. `docs/MOBILE-CROSS-APP-SOURCE-OF-TRUTH.md` must describe the same authentication boundary.
5. Website/server authentication MD must define the server implementation before server code is changed.

Only after those documents are aligned may Phase 1 code implementation begin.


## Cross-Platform Authentication and Payment Continuity

Website and Mobile authenticate the same customer identity using the same server OTP flow and Firebase UID. A customer authenticated on either platform must be able to access the same customer-owned orders and payment attempts. A `pending_payment` or `payment_failed` order created from Mobile must be checkable/retryable from Website, and the same must work for an order created from Website. Payment state is server-authoritative and is never platform-specific.
