# Seedlings Mobile — Phase 12 Handover

**Application:** `seedlings-mobile`
**Phase:** 12 — Notifications
**Baseline:** Phase 11 profile/photo/addresses with Expo Image Picker runtime crash fix
**Status:** Phase 12 development implemented; native dependency installation/build must be run in the development environment.

## Architecture
- Expo + React Native + TypeScript + Expo Router.
- Firebase Authentication + Firestore direct for normal customer functionality.
- Native Firebase Messaging for Android FCM push registration.
- Existing Website server remains responsible for notification creation and FCM sending.
- No Firebase Functions.
- No new Website API.

## Phase 12 Delivered
- Real-time notification center.
- Unread notification state/count.
- Mark one notification read.
- Mark all notifications read.
- Order/subscription notification navigation.
- Android FCM token registration using the authenticated Firebase UID and customer mobile identity.
- Token refresh handling.
- Token invalidation during logout.
- Foreground notification toast.
- Background/terminated FCM delivery through the existing Website notification sender.
- Push-tap handling for order/subscription/notification-center navigation.
- Profile → Notifications entry.

## Cross-App Contract Update
The Website `firestore.rules` must allow `platform` values `web`, `android`, and `ios` in `customerPushSubscriptions`. No Website business/API behavior changes are required.

## Required Installation
The Mobile project now requires:

```text
@react-native-firebase/messaging 26.4.0
```

Run `npm install` in the Mobile project before native prebuild/build.

## Validation
The source archive does not contain `node_modules`, so dependency-backed TypeScript/native build validation cannot be completed in this environment. JSON/package configuration was validated. Run:

```text
npm install
npx expo prebuild --platform android --clean
npm run typecheck
npx expo run:android
```

Then manually verify:

1. Sign in.
2. Grant Android notification permission.
3. Confirm an `android_*` document appears under `customerPushSubscriptions`.
4. Create/send a notification from the existing Website/Admin notification flow.
5. Verify background notification delivery.
6. Open the notification and verify navigation.
7. Verify foreground notification toast.
8. Verify Notifications center updates without manual reload.
9. Verify mark-read and mark-all-read.
10. Sign out and verify the previous push token becomes inactive.
