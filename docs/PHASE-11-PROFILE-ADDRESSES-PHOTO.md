# Seedlings Mobile — Phase 11: Profile, Addresses & Profile Photo

## Objective
Complete customer Profile, Addresses and Profile Photo using the standardized UI system.

## Scope
- View/edit customer profile name and email.
- Show authenticated mobile number as read-only.
- Select/crop profile photo from device gallery.
- Upload profile photo to Firebase Storage using the authenticated Firebase UID.
- Store the shared customer photo URL in `profilePhotoUrl` on `customers/{normalizedMobile}`. Mobile reads legacy `photoUrl` as a fallback and writes it only as a backward-compatible mirror during the transition.
- Preview, replace and remove profile photo.
- Preserve existing address add/edit/delete/default behavior.
- Standardize profile/address UI through shared components.
- Preserve existing Firebase/Firestore direct architecture.

## Security
- Profile photos are stored under `customer-profile/{authUid}/profile.jpg`.
- Storage access must require an authenticated user whose UID matches the path UID.
- No Firebase Functions or Website API is introduced.
- Customer Firestore ownership remains enforced by existing Firestore rules.

## UI Standard
- Use shared `AppText`, `AppInput`, `Button`, `Card`, `AppIconButton` and design tokens.
- Profile photo is a 96x96 circular avatar with standard edit/remove actions.
- Loading, upload and error states are explicit and user-readable.
- Buttons have full touch surfaces.
- Address forms use the standard input/button components.

## Validation
- Profile loads from Firestore.
- Name/email validation remains enforced.
- Photo selection, upload, replacement and removal work with authenticated user.
- Address CRUD and default address continue to work.
- Existing checkout address behavior remains unchanged.
- Android physical-device verification required.

## Workflow
Update MD → inspect source → implement shared/profile/address changes → typecheck/build → physical Android verification → regression → update changelog.

## Runtime Stability Architecture — Profile Photo Storage

Profile photo storage uses the existing Firebase Web SDK Storage client already used by the Mobile application. React Native Firebase Storage is not used.

Reason: normal Mobile customer functionality already uses the Firebase Web SDK directly. Using the existing Web SDK for profile-photo Storage avoids introducing a separate native Storage module and its native autolinking/configuration failure surface.

Implementation:
- `firebase/storage` `ref` / `uploadBytes` / `getDownloadURL` for upload.
- Local image URI is converted to a Blob before upload.
- Storage path remains `customer-profile/{firebaseAuthUid}/profile.jpg`.
- Firestore customer `profilePhotoUrl` is the cross-app profile-photo field. `photoUrl` is retained only as a Mobile legacy fallback/mirror.
- No Firebase Functions or Website API is introduced.
- `@react-native-firebase/storage` is not a project dependency and is not registered as an Expo plugin.

This is the canonical Phase 11 profile-photo Storage architecture.

## Open Cross-App Storage Decision

The Website currently uploads customer profile photos through Cloudinary while Mobile uploads to Firebase Storage. The shared field is now aligned on `profilePhotoUrl`, but the single long-term storage backend still requires an owner decision. Until that decision is made, Mobile must not introduce Cloudinary credentials or a new Website upload API.

## Phase 11 Runtime Crash Fix — Expo Image Picker Compatibility

### Confirmed Android crash

The first installed Phase 11 Android build crashed during application startup with:

```text
java.lang.NoClassDefFoundError:
expo/modules/kotlin/types/AnyTypeProvider

Failing module:
expo.modules.imagepicker.ImagePickerModule
```

The crash occurred while Expo was registering native modules, before the application UI loaded.

### Root cause

The project uses Expo SDK 57 / React Native 0.86, but `expo-image-picker` was pinned to the old `~17.0.8` package line. This native package was incompatible with the Expo Modules Kotlin runtime present in the SDK 57 application and caused the missing `AnyTypeProvider` class at startup.

### Permanent fix

`expo-image-picker` is now aligned to the Expo SDK 57 package line:

```text
expo-image-picker: ~57.0.20
```

The existing `expo-image-picker` config plugin remains enabled because it is a supported Expo SDK 57 module. No Firebase, payment, order, subscription, or business logic changes are required for this crash.

### Required native rebuild

Because this is a native dependency correction, the Android project must be regenerated and rebuilt after installing dependencies:

```text
npm install
npx expo prebuild --platform android --clean
npx expo run:android
```

Do not reuse an APK generated from the previous `expo-image-picker` 17.x dependency set.

## CI-27 verification status — address management

The current Mobile source was audited against the address-save, checkout-selection, and selected-address-consistency requirements. The evidence shows the implementation already matches the approved contract:

- Address writes are persisted to the customer document through the shared `customers/{normalizedMobile}` record in [services/customerAddresses.ts](../services/customerAddresses.ts).
- Address CRUD keeps the list order stable and preserves the default-address-first behavior while updating the in-memory customer cache.
- Checkout reloads the current customer address list and rebinds `selectedAddressId` to the first valid address when the previous selection no longer exists in [app/(customer)/checkout/index.tsx](../app/(customer)/checkout/index.tsx).
- A missing or deleted address is handled safely because checkout blocks the flow when no selection remains and the account screen redirects back to the address-management flow rather than using stale state.
- Delivery-charge recalculation uses the selected address’s pincode and is refreshed when the address list or selected address changes.

This means CI-27 is currently an “Already implemented and verified” Mobile-side case. Any real-world address mismatch beyond the source is a server/data-contract or cached-remote-data issue rather than a confirmed Mobile bug to patch.

