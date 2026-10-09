# Mobile Firebase Authentication Setup

**Status:** Final UAT architecture baseline  
**Updated:** 2026-10-08

The authoritative authentication decision is:

`docs/MOBILE-AUTHENTICATION-DECISION.md`

## 1. Authentication Mechanism

Seedlings customer authentication uses:

```text
Server-generated 4-digit OTP
        ↓
Server OTP verification
        ↓
Firebase Admin createCustomToken()
        ↓
Mobile signInWithCustomToken()
        ↓
Firebase Auth session
```

Firebase Phone Authentication is not used.

Firebase Anonymous Auth is not used as the customer-login mechanism.

## 2. Demo OTP

Demo mode uses the same server authentication API as Real mode.

```text
Generate dynamic 4-digit OTP
        ↓
Store OTP + expiry server-side
        ↓
Return generated OTP for controlled Demo mode
        ↓
Mobile SweetAlert
        ↓
Verify OTP API
        ↓
Firebase Custom Token
```

The previous fixed `1234` configuration architecture is obsolete.

There must be no fixed OTP verification value in the Mobile configuration.

## 3. Real OTP

Real mode uses:

```text
Mobile
  ↓
Authentication OTP API
  ↓
Server generates/stores OTP
  ↓
Server SMS provider
  ↓
Customer
  ↓
Verify OTP API
  ↓
Firebase Admin custom token
  ↓
Mobile signInWithCustomToken()
```

The SMS provider is never called directly from Mobile.

## 4. Firebase APIs

Approved Mobile authentication API:

```text
signInWithCustomToken()
```

Prohibited for customer OTP:

```text
signInWithPhoneNumber()
verifyPhoneNumber
PhoneAuthProvider
RecaptchaVerifier
Firebase Phone Authentication SMS verification
Anonymous Auth as customer-login authentication
```

## 5. Firebase Admin Boundary

Firebase Admin SDK is server-side only.

The server is responsible for:

- resolving/creating the Firebase Auth identity
- creating the Firebase custom token

The Mobile application must never contain:

```text
Firebase Admin credentials
Service account private key
Firebase Admin SDK credentials
```

## 6. Customer Identity

The business customer record remains:

```text
customers/{normalizedMobile}
```

Firebase Auth UID remains the authentication/session identity.

The server must preserve an existing customer's canonical Firebase UID rather than creating a new identity for every successful OTP.

## 7. Firebase Web Configuration

Expo Web continues to use the existing public Firebase configuration:

```text
EXPO_PUBLIC_FIREBASE_API_KEY
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN
EXPO_PUBLIC_FIREBASE_PROJECT_ID
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
EXPO_PUBLIC_FIREBASE_APP_ID
```

These are Firebase client configuration values and are not Firebase Admin credentials.

## 8. Native Firebase Configuration

Native Firebase configuration remains required for the existing Mobile Firebase functionality.

Android:

```text
android/app/google-services.json
```

The Firebase Android application package remains:

```text
com.seedlingsmicrogreens.app
```

For iOS, when enabled:

```text
GoogleService-Info.plist
```

Authentication migration must not remove or replace the Firebase configuration required by the rest of the Mobile application.

## 9. Authentication API Configuration

Mobile requires only the public/reachable base URL for the authentication server API.

Server-only configuration remains outside Mobile:

```text
SMS_API_URL
SMS_USER
SMS_KEY
SMS_SENDER_ID
SMS_ACCUSAGE
SMS_ENTITY_ID
SMS_TEMPLATE_ID
Firebase Admin credentials
```

No SMS credentials or Firebase Admin credentials may be placed in Expo `EXPO_PUBLIC_*` variables.

## 10. Security Boundary

```text
Mobile
  ↓
Authentication API
  ↓
OTP/SMS/Firebase Admin
```

The Mobile application is never trusted to:

- generate the authoritative OTP
- validate the authoritative OTP
- decide OTP expiry
- send SMS
- create Firebase custom tokens

## 11. Documentation-First Rule

This document describes the Firebase portion of the approved architecture only.

Any change to the authentication mechanism must first update:

- `docs/MOBILE-AUTHENTICATION-DECISION.md`
- `docs/PHASE-1-CUSTOMER-AUTHENTICATION.md`
- affected architecture/reference MDs

Only then may implementation change.
