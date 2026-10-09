# Seedlings Mobile — Phase 13 Handover

**Application:** `seedlings-mobile`
**Phase:** 13 — Feedback
**Baseline:** Phase 12 Notifications
**Status:** Phase 13 development implemented; Account UI/UX and cross-platform profile-photo synchronization refinement implemented on the Phase 11/13 baseline.

## Delivered
- Delivered-order feedback for one-time and subscription delivery orders.
- 1–5 star rating.
- Optional comment.
- Packaging/Cleanliness/Freshness feedback options.
- Delivery-partner On time/Less calling options when a partner is stored on the order.
- Up to 3 PNG/JPG/JPEG photos, max 5 MB each.
- Firebase Storage uploads scoped to authenticated Firebase UID.
- Duplicate feedback prevention per delivered order.
- `Rate this order` on delivered Order Details.
- Profile → Feedback entry.

## Profile Photo Architecture
- Mobile uses the existing Firebase Web SDK Storage implementation for customer profile photos.
- `photoUrl` on the customer Firestore document is the cross-platform source of truth.
- The stale `@react-native-firebase/storage` dependency has been removed from Mobile.
- Do not reintroduce `@react-native-firebase/storage` for profile photos.

## Account UI/UX + Profile Synchronization Refinement
- Shared Button uses one native Pressable surface with fixed geometry and centrally aligned content.
- Account navigation uses reusable `AccountMenuSection` and `AccountMenuItem` components with consistent icons, row touch targets and chevrons.
- Shared `ProfileAvatar` displays the remote customer `photoUrl` and falls back to initials on load failure.
- Customer profile cache retains `photoUrl`; Account/Profile render cache first and reconcile with a fresh Firestore read.
- Mobile photo upload/remove updates the local profile cache.
- Existing business behavior remains unchanged.

## Validation
```bash
npm install
npx expo prebuild --platform android --clean
npm run typecheck
npm run check:architecture
npx expo run:android
```

## Phase 14
After Phase 13 manual verification, Phase 14 is the final Complete Integration + Regression + Release Validation phase.

- Feedback image storage uses the Firebase Web SDK Storage client from `services/core/firebaseClient.ts`; `@react-native-firebase/storage` must not be imported or reintroduced.
