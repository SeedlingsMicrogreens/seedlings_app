# Seedlings Mobile — Account UI/UX + Cross-Platform Profile Photo Phase

## Objective

Rework the Account/Profile experience at the shared UI architecture level.

This is **not a visual patch phase**. The implementation must correct the underlying shared component/layout patterns so the same issues do not reappear on other screens.

## Source of Truth

- Latest Mobile source: `seedlings_mobile_phase_11.zip`
- Website remains the business/data-behavior reference.
- Existing Firebase/Firestore direct Mobile architecture remains unchanged.
- No Firebase Functions.
- No Website API for normal customer profile functionality.
- Do not introduce screen-specific styling workarounds.

## Confirmed Issues From Physical Android UI

### 1. Shared Button text alignment

The button text is visibly not consistently centered.

This must be fixed in the **shared `Button` component**, not in individual screens.

Required architecture:

- One native visual button surface.
- Full-size `Pressable` interaction layer.
- Content container fills the complete button height.
- `alignItems: 'center'` and `justifyContent: 'center'` are applied to the interaction/content layers.
- Use a fixed standard button height rather than relying on nested `minHeight` values.
- Android font padding/alignment must be handled centrally.
- Loading indicator must use the same centered content area.
- Disabled/pressed/loading states must preserve the same geometry.
- No screen may add custom vertical offsets to compensate.

### 2. Account page UX/UI

The current Account menu is visually inconsistent and does not provide a sufficiently clear mobile navigation hierarchy.

The Account page must be rebuilt using reusable shared menu components.

Required standard:

- Replace emoji/text glyph icons with a consistent icon set already available in the project.
- Every row has the same height, icon container, label alignment and touch target.
- Chevron/action indicator is consistently placed at the far right.
- Row separators are consistent and do not create detached visual elements.
- Full row is the touch target.
- Pressed state is centralized.
- Use design tokens for spacing, typography, colors, radius and borders.
- Group related account functions into clear sections:
  - Account: My Profile, Delivery Addresses
  - Orders & Delivery: My Orders, My Subscriptions, Delivery Calendar
  - Communication: Notifications, Feedback
- Preserve the existing routes and business behavior.
- Sign out remains a separate destructive/secondary action below the menu.
- The page must remain safe-area aware and must not collide with the fixed bottom navigation.

Create reusable shared components such as `AccountMenuItem` and `AccountMenuSection` rather than keeping the menu implementation local to `profile.tsx`.

### 3. Profile photo synchronization

A profile photo already uploaded from the Website must be visible in Mobile.

The Mobile implementation must treat the existing customer profile `photoUrl` as the cross-platform source of truth.

Required behavior:

1. Load the authenticated customer's existing `customers/{normalizedMobile}` profile.
2. Read `photoUrl`.
3. If `photoUrl` exists, render the remote image in:
   - Account/Profile header avatar.
   - Customer Profile screen avatar.
4. If no `photoUrl` exists, render the standard initials avatar.
5. Do not require the photo to be uploaded again from Mobile.
6. Do not create a second Mobile-only profile-photo field.
7. Preserve the existing Mobile upload/change/remove capability.
8. After upload/change/remove, refresh/update the shared profile state so Account and Profile remain synchronized.
9. Avoid stale cache causing an old initials avatar to remain after the Website has already stored a photo.
10. Image loading failure must gracefully fall back to the initials avatar without breaking the screen.

### Profile cache requirement

The current cache-first profile service can prevent a Website-uploaded `photoUrl` from being observed if the cached customer record is older.

Profile loading must therefore be standardized so that:

- Cached data may render immediately.
- A Firestore refresh must reconcile the current `photoUrl`.
- Fresh Firestore `photoUrl` must replace stale cached data.
- The resulting profile state is shared consistently by Account/Profile screens.
- Do not add arbitrary cache-bypass flags per screen.

## Shared UI Architecture Changes

Extend the existing UI system rather than creating page-specific components.

Required reusable components/patterns:

- `Button`
- `AccountMenuSection`
- `AccountMenuItem`
- standardized avatar/profile image rendering
- centralized remote-image fallback behavior

The shared UI layer remains the only place for visual rules.

## Business Logic Constraints

Do not change:

- Authentication
- Firestore customer identity
- Orders
- Subscriptions
- Delivery calendar
- Notifications
- Feedback
- Cashfree/payment behavior
- Cart behavior
- Address business rules

Only presentation, shared UI architecture and profile-photo synchronization are in scope.

## Validation

### Static

Run:

```bash
npm run typecheck
```

Resolve errors introduced by this work. Do not hide errors with `any`, `@ts-ignore`, or unrelated changes.

### Android

Regenerate native project when required by the current dependency/native state:

```bash
npx expo prebuild --platform android
```

Then build/install using the project's configured EAS/local Android workflow.

### Physical-device checks

Verify:

- Button text is geometrically centered.
- Loading button content is centered.
- Full button surface is tappable.
- Account rows have consistent alignment.
- Icons are visually consistent.
- Chevron is on the right side of every row.
- Entire row is tappable.
- Bottom navigation does not overlap Account content.
- Account page scrolls correctly.
- Website-uploaded profile photo appears in Mobile without re-upload.
- Mobile-uploaded photo remains visible after reopening Account.
- Missing/broken photo URL falls back to initials.
- No regression to Profile edit, photo change/remove, Addresses, Orders, Subscriptions, Delivery Calendar, Notifications or Feedback navigation.

## Regression Rule

If a defect is found in a shared component, fix the shared component.

Do not add:

- screen-specific offsets
- duplicate Button implementations
- duplicate menu-row implementations
- arbitrary margins to compensate for alignment
- separate Website/Mobile profile-photo fields

## Required Workflow

**Update MD → inspect latest source → implement shared UI architecture → implement profile synchronization → typecheck → Android build → physical-device validation → regression → update changelog/handover.**

## Completion Criteria

This phase is complete only when:

1. Shared Button alignment is structurally correct.
2. Account navigation uses shared account-menu components.
3. Account UX is consistent and visually organized.
4. Website-uploaded `photoUrl` is displayed by Mobile without re-upload.
5. Profile cache cannot permanently mask a newer Firestore photo URL.
6. Existing business behavior is unchanged.
7. Typecheck/build validation is completed or the exact environment blocker is documented.
8. Changelog and Mobile handover are updated.

## Implementation Status — 2026-10-08

Implemented on the supplied Phase 11 source baseline:

- Shared Button rebuilt around one native Pressable surface with fixed geometry and centered content. **(Status correction 2026-10-09: not effective — see end of document.)**
- Shared ProfileAvatar added with remote-image failure fallback.
- Shared AccountMenuSection and AccountMenuItem added.
- Account tab reorganized into Account, Orders & Delivery, and Communication sections.
- Profile/account menu now uses MaterialCommunityIcons, consistent touch targets and chevrons.
- Customer profile cache now retains photoUrl.
- Account and Profile screens render cached profile data first and reconcile with fresh Firestore data.
- Mobile profile photo upload/remove updates the local profile cache.
- Stale @react-native-firebase/storage dependency removed from package.json/package-lock.json.
- Changelog and handover updated.

Validation performed in the development container:

- package.json/package-lock.json JSON validation: PASS.
- Dependency verification: expo-image-picker remains ~57.0.20; @react-native-firebase/storage removed.
- Full typecheck could not run because the supplied source ZIP has no complete installed dependency tree; npm dependency installation timed out in the container. This is an environment validation limitation, not a reported source-code typecheck result.
- Physical Android validation still requires rebuilding/installing this updated source in the Android development environment.


## CI-28 investigation — Account tab refresh after profile edit

### Findings from source inspection

The current Mobile profile flow is mostly correct in its data-source patterns, but there is a real refresh gap in the Account/Profile UX:

- The Account tab entry screen at `app/(customer)/(tabs)/profile.tsx` loads profile name/photo only once on mount and does not re-run the refresh when the user returns from the edit screen.
- The edit screen at `app/(customer)/account/profile.tsx` also loads profile data in a mount effect and does not refresh on focus.
- The shared profile cache helper in `services/customerProfile.ts` clears the customer cache after `updateCustomerProfile`, which can erase the most recent values instead of preserving them until the next Firestore refresh completes.
- This produces stale name/photo state after returning from the profile edit flow until the app is reloaded or a fresh mount occurs.

### Proposed fix

- Refresh the profile data whenever the Account/Profile screen regains focus.
- Preserve the latest customer profile values in the local cache instead of clearing them after a successful save.
- Keep remote Firestore as the authoritative source, but merge newer values back into the cache in a way that does not overwrite the latest edits with stale snapshots.

This is a Mobile-only fix and does not change the Website/Admin contract or authentication flow.

## Follow-up Build Correction — 2026-10-08

Android bundling exposed one remaining stale import in the existing Phase 13 feedback service:

- `services/feedback/feedbackService.ts` was still importing `@react-native-firebase/storage` even though that native dependency had been intentionally removed from the project.
- This caused Metro bundling to fail before the Account/Profile work could run.

Correct implementation:

- Feedback image upload now uses the existing Firebase Web SDK Storage client from `services/core/firebaseClient.ts`.
- Feedback image cleanup uses Firebase Web SDK `deleteObject`.
- No `@react-native-firebase/storage` dependency or import remains.
- No Website API is introduced.
- This aligns feedback image storage with the same Firebase Web SDK Storage architecture already used by customer profile photos.

## Android Build Dependency Stabilization

The first physical Android build exposed a transitive Expo Router dependency resolution problem: `@expo/ui` was resolved to 57.0.19 and Gradle attempted to resolve `expo.modules.ui:expo.modules.ui:57.0.19`, which was unavailable to the generated Android build. The dependency is now explicitly pinned to `@expo/ui ~57.0.21`, the current SDK 57 recommended Expo UI line, while retaining Expo SDK 57 and Expo Router. This is a dependency-resolution correction, not an Android Gradle workaround.

## UAT-5 locked implementation update (2026-10-09)
- Shared Button uses Pressable as the outermost component, making the full visible button surface tappable. Button label/loading content remains centered vertically and horizontally; existing green styling is retained. **(Status correction 2026-10-09: not reflected in the audited source — see below.)**
- Checkout summary no longer displays a separate MRP row, a second product-savings row, or a duplicate savings banner. Product subtotal, offer savings, delivery charge, and total calculations are retained.
- Delivery Calendar supports Reschedule Delivery only. Skip Delivery control and skip action type have been removed. Existing historical status records may still be read as history, but no customer skip action is available.
- Empty foreground push notification title/message pairs are ignored to avoid empty notification overlays; valid foreground push notifications are still shown.
- Authentication decisions are unchanged: the Website API controls `CUSTOMER_OTP_DEMO_MODE`, OTP generation/verification remains server-side, and Firebase Custom Token sign-in remains the shared Website/Mobile path.
- Validation status for this ZIP: source grep confirms no active Skip Delivery UI/action references remain in the customer UI/service. Full TypeScript and Android build checks remain pending because dependencies are not installed in the provided environment.


## Status Correction — 2026-10-09 (UI baseline audit)
- The Button requirements in §1 of this document (native visual surface, full-size Pressable interaction layer, centered content, fixed height) were **not met** by the audited source. The Button styled its surface with a function-valued `Pressable.style`, which NativeWind's JSX runtime replaced with `{}`; `styles.button` also lacked `alignItems`/`justifyContent`. On device the checkout button rendered as white text with no green surface.
- `AccountMenuItem` used the same function-valued style and therefore also lost its row layout at runtime.
- These requirements are carried into the UI baseline: `docs/PHASE-8-UI-UX-STANDARDIZATION.md` §16 (status tracked there).
