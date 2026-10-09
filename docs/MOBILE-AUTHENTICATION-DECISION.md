# Seedlings Mobile — Authentication Decision

**Status:** Approved Final UAT architecture baseline  
**Updated:** 2026-10-08

## 1. Purpose

This document is the authoritative shared customer authentication architecture for Seedlings Website and Mobile.

The authentication architecture has been changed from the previous Firebase Phone Authentication / fixed development OTP flow to a **server-controlled 4-digit OTP flow followed by Firebase Custom Token authentication**.

Implementation must follow this document. No authentication code changes are to be made before this MD baseline is approved.

## Implementation Status

The Mobile client implementation consumes the following server contract:

```text
POST /api/customer/auth/send-otp
POST /api/customer/auth/verify-otp
```

The Mobile client does not generate or verify the authoritative OTP. The server must implement OTP persistence, expiry, invalidation, SMS delivery, customer identity resolution and Firebase Admin custom-token creation.

## 2. Final UAT Authentication Architecture

Seedlings Mobile uses **exactly one OTP format: 4 numeric digits**.

```text
0000 - 9999
```

Example:

```text
4827
```

The previous fixed development OTP `1234` is no longer an OTP verification value.

The following are NOT part of the approved authentication architecture:

- Firebase Phone Authentication
- Firebase-generated 6-digit OTP
- `signInWithPhoneNumber()`
- `verifyPhoneNumber`
- `PhoneAuthProvider`
- `RecaptchaVerifier` for customer OTP
- Mobile-side OTP verification
- Fixed OTP `1234`
- Firebase Anonymous Auth as the customer-login session mechanism
- Direct Mobile-to-SMS-provider communication

## 3. Approved Authentication Flow

```text
Customer enters mobile number
            ↓
       Validate mobile
            ↓
        Send OTP
            ↓
Authentication OTP API
            ↓
Server generates random 4-digit OTP
            ↓
Store OTP securely with expiry
            ↓
      Demo OTP enabled?
        /          \
      YES           NO
       ↓             ↓
Return generated    Send OTP through
OTP for controlled  server SMS provider
demo display
       \             /
        \           /
         ↓         ↓
          OTP Screen
              ↓
        Enter 4-digit OTP
              ↓
        Verify OTP API
              ↓
       Server verifies OTP
              ↓
     Resolve/create Firebase
        customer identity
              ↓
 Firebase Admin createCustomToken()
              ↓
      Return custom token
              ↓
Mobile signInWithCustomToken()
              ↓
     Firebase Auth session
              ↓
             Home
```

The server is the trusted authentication boundary.

## 4. Authentication API Boundary

Authentication requires a server because:

- OTP generation must be trusted.
- OTP verification must be trusted.
- OTP expiry/invalidation must be server-controlled.
- SMS credentials must remain private.
- Firebase custom tokens require Firebase Admin credentials.

Approved boundary:

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

This is a shared Website/server authentication API used by both Website and Mobile, in addition to the existing Cashfree/payment API exception.

Mobile must NOT call the SMS provider directly.

Mobile must NOT contain:

```text
SMS_USER
SMS_KEY
SMS_API credentials
Firebase Admin credentials
Firebase service-account credentials
```

## 5. Send OTP

Conceptual API:

```text
POST /api/customer/auth/send-otp
```

Request:

```json
{
  "mobile": "<normalized mobile number>"
}
```

Server responsibilities:

1. Validate the mobile number.
2. Normalize the mobile number.
3. Generate a new secure random 4-digit OTP.
4. Invalidate any previous active OTP for the mobile number.
5. Store the OTP securely with issuance time and expiry.
6. If Demo OTP is enabled, return the generated OTP through the controlled development response.
7. If Demo OTP is disabled, send the OTP through the server-side SMS provider.
8. Never expose SMS credentials.

Recommended server-side OTP record:

```text
customerOtpSessions/{normalizedMobile}
    otpHash
    issuedAt
    expiresAt
    consumedAt
```

The OTP value itself should not be stored in plaintext unless a server-side implementation decision explicitly requires it.

### Demo response

```json
{
  "success": true,
  "demo": true,
  "demoOtp": "4827"
}
```

`demoOtp` is returned only when controlled Demo OTP mode is enabled.

### Real response

```json
{
  "success": true,
  "demo": false
}
```

The real OTP must never be returned to Mobile.

## 6. Demo OTP Mode

When Demo OTP is enabled:

```text
Generate new 4-digit OTP
        ↓
Store OTP + expiry server-side
        ↓
Return generated OTP to Mobile
        ↓
Mobile displays OTP using approved SweetAlert
        ↓
Customer enters OTP
        ↓
Mobile calls Verify OTP API
        ↓
Server verifies OTP
        ↓
Firebase custom token
        ↓
Mobile signInWithCustomToken()
```

Every Send OTP and Resend OTP request generates a new OTP.

The old fixed value:

```text
1234
```

must never be used as the verification value.

Demo mode is for controlled development/UAT and does not represent real SMS delivery.

## 7. Real SMS / Final UAT Mode

When Demo OTP is disabled:

```text
Generate 4-digit OTP on server
        ↓
Store OTP + expiry
        ↓
Call SMS provider from server
        ↓
Customer receives SMS
        ↓
Customer enters 4-digit OTP
        ↓
Verify OTP API
        ↓
Server validates OTP
```

Server environment configuration:

```text
SMS_API_URL=<SMS provider endpoint>
SMS_USER=<SMS provider username>
SMS_KEY=<SMS provider key>
SMS_SENDER_ID=OTPSSS
SMS_ACCUSAGE=1
SMS_ENTITY_ID=1201159543060917386
SMS_TEMPLATE_ID=1207161729866691748
```

The actual SMS key/value must never be committed to source control, documented in plaintext, returned by an API, or bundled into Mobile.

### Supplied SMS provider request reference

The provider sample supplied for this UAT architecture is conceptually:

```text
http://sms.bulkssms.com/submitsms.jsp?user=<SMS_USER>&key=<SMS_KEY>&mobile=<MOBILE>&message=<URL_ENCODED_MESSAGE>&senderid=<SMS_SENDER_ID>&accusage=<SMS_ACCUSAGE>&entityid=<SMS_ENTITY_ID>&tempid=<SMS_TEMPLATE_ID>
```

The supplied sample contained a partially masked key and is intentionally represented above using server-side placeholders.

The server implementation must use the provider's configured endpoint and credentials only. **Plain HTTP must not be used to transmit the SMS key in Final UAT if the provider offers HTTPS; HTTPS is the required transport whenever supported.**

Expected message:

```text
Dear Customer, Your OTP is <4-DIGIT-OTP> for Seedlings Microgreen, Please do not share this OTP. Regards
```

Configured sender ID, entity ID and template ID must come from server environment configuration.

## 8. Resend OTP

Resend uses the same Send OTP issuance flow.

When Resend is pressed:

1. Previous OTP becomes invalid.
2. Generate a new 4-digit OTP.
3. Reset OTP expiry.
4. Demo mode returns/displays the new OTP.
5. Real mode sends the new OTP through the SMS provider.
6. The previous OTP must fail verification.

Example:

```text
First OTP  → 4827
Resend     → 7315

4827 → invalid
7315 → valid
```

## 9. OTP Expiry and Consumption

Every generated OTP has a server-controlled expiry.

Verification must reject:

- expired OTP
- incorrect OTP
- previous OTP
- already-consumed OTP
- invalid OTP

A successful OTP verification must mark the OTP as consumed before authentication is considered complete.

Mobile UI countdown is informational only. It is never the security authority for OTP expiry.

## 10. Verify OTP

Conceptual API:

```text
POST /api/customer/auth/verify-otp
```

Request:

```json
{
  "mobile": "<normalized mobile number>",
  "otp": "<4 digits>"
}
```

The server validates:

- normalized mobile number
- current OTP
- OTP issuance state
- OTP expiry
- OTP consumption state

Failed verification:

```text
OTP invalid/expired
       ↓
API error
       ↓
Mobile remains on OTP screen
       ↓
Standard authentication error
```

No customer session is created/restored from a failed OTP.

## 11. Firebase Custom Authentication

Firebase Authentication remains the customer identity/session mechanism.

However, Firebase Phone Authentication is not used for this flow.

After successful server OTP verification:

```text
OTP verified
    ↓
Find existing customer by normalized mobile
    ↓
Resolve existing Firebase Auth UID
    ↓
If no Firebase identity exists, create one server-side
    ↓
Firebase Admin createCustomToken(firebaseUid)
    ↓
Return custom token to Mobile
    ↓
Mobile signInWithCustomToken()
    ↓
Firebase authenticated session
```

Mobile must never create Firebase custom tokens.

Firebase Admin credentials remain server-side.

## 12. Customer Business Identity

The business identity remains:

```text
customers/{normalizedMobile}
```

Example:

```text
customers/9876543210
```

Firebase UID remains the authentication/session identity.

Existing customer identity must be preserved:

- If the customer already has a canonical `authUid`, use it.
- Do not create a replacement Firebase identity on every login.
- If historical `authUids` exist, the server must resolve the approved active identity consistently.
- A new Firebase Auth identity may be created only when the customer has no usable Firebase identity.
- Customer business data must not be duplicated merely because authentication is being migrated.

## 13. Existing Customer / Migration Rule

The new OTP mechanism authenticates the customer by verified mobile number.

The server must reconcile that verified mobile number with the existing:

```text
customers/{normalizedMobile}
```

record before creating the Firebase custom token.

The Mobile application must not attempt to recreate or guess an existing Firebase UID from the mobile number.

## 14. Authentication UI

The authentication UI uses the canonical shared Mobile Button component for:

- Send OTP
- Resend OTP
- Verify OTP

Buttons must have:

- visible solid background
- visible contrasting text
- centered text/content
- entire button surface clickable
- standard loading state
- standard disabled state
- standard pressed state

The current transparent-background/white-text button issue must be fixed through the shared Button implementation, not through authentication-screen-specific button styling.

OTP UI:

- mobile number input
- four OTP cells
- countdown/expiry indicator
- Send OTP
- Verify OTP
- Resend OTP
- loading states
- error states
- controlled Demo OTP SweetAlert

No 6-digit OTP UI is allowed.

## 15. Firebase APIs Prohibited for Customer OTP

The following must not be used:

```text
verifyPhoneNumber
signInWithPhoneNumber
PhoneAuthProvider
Firebase Phone Authentication SMS verification
RecaptchaVerifier
Firebase Anonymous Auth for customer login
```

`signInWithCustomToken()` is the approved Mobile Firebase sign-in mechanism after successful server OTP verification.

## 16. Authentication API Security

The authentication API must enforce server-side controls appropriate for OTP authentication, including:

- normalized mobile validation
- OTP expiry
- single-use consumption
- previous-OTP invalidation
- invalid-attempt handling
- server-only SMS credentials
- server-only Firebase Admin credentials
- no OTP return in real mode

Rate limiting / resend throttling must be implemented at the server authentication boundary before Final UAT if required by the deployed SMS/provider configuration.

## 17. Non-negotiable Rules

```text
4-digit OTP only
Server-generated OTP
Server-side OTP verification
Server-side expiry
Server-side invalidation
Single-use OTP
Dynamic OTP on every Send/Resend
Demo OTP may be returned only in Demo mode
Real OTP is never returned to Mobile
SMS credentials remain server-side
Firebase Admin credentials remain server-side
Firebase custom token created only server-side
Mobile uses signInWithCustomToken()
No Firebase Phone Auth
No 6-digit Firebase OTP
No fixed 1234
No Mobile-side OTP verification
No Anonymous Auth customer-login session
No direct Mobile-to-SMS-provider communication
```

## 18. Documentation-First Rule

Authentication implementation must follow this order:

1. Update this architecture decision first.
2. Update all affected Mobile MD files.
3. Update the Website/server authentication MD before server implementation.
4. Implement server authentication.
5. Implement Mobile authentication.
6. Remove obsolete Firebase Phone Auth/fixed-OTP behavior.
7. Run typecheck/build validation.
8. Perform Demo OTP and Real SMS UAT.
9. Update `CHANGELOG.md`.

No authentication code implementation should begin while affected MDs still describe the old architecture.


## Cross-Platform Authentication and Payment Continuity

Website and Mobile authenticate the same customer identity using the same server OTP flow and Firebase UID. A customer authenticated on either platform must be able to access the same customer-owned orders and payment attempts. A `pending_payment` or `payment_failed` order created from Mobile must be checkable/retryable from Website, and the same must work for an order created from Website. Payment state is server-authoritative and is never platform-specific.
