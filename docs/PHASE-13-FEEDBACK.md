# Seedlings Mobile — Phase 13: Feedback

## Status
Implemented — 2026-10-08.

## Objective
Provide customer feedback for completed deliveries using the shared Firebase architecture while preserving the Website `orderFeedback` data contract.

## Scope
- Feedback is available only for orders whose stored delivery/order status is `delivered`.
- Supports both one-time orders and subscription delivery orders because feedback is linked to the delivered order record.
- Overall 1–5 star order rating.
- 1–5 star delivery-partner rating when a delivery partner is applicable.
- Optional free-text comment.
- Website-compatible order feedback options, including Packaging, Cleanliness, Freshness and the current Website option set.
- Website-compatible delivery-partner feedback options, including On time and Less calling plus any current Website options.
- Up to 3 photos per feedback submission.
- Accepted photo types: PNG, JPG/JPEG.
- Maximum photo size: 5 MB per image.
- Feedback photos are stored under Firebase Storage using the authenticated Firebase UID.
- Customer can see previously submitted feedback and cannot submit duplicate feedback for the same delivered order.
- Delivered Order Details provides a direct `Rate this order` action.
- Feedback submitted from Mobile must be visible to Website because both platforms use the shared `orderFeedback` contract.
- Profile provides a Feedback entry.

## Data Contract
`orderFeedback/{feedbackId}` is the shared cross-platform feedback collection and stores the Website-compatible contract:

```text
customerId
authUid
orderId
subscriptionDeliveryId (when applicable)
orderRating
orderFeedbackOptions[]
deliveryRating
deliveryFeedbackOptions[]
comment
createdAt
updatedAt
```

Mobile may additionally store its approved photo metadata under the same feedback record:

```text
images[]
```

Mobile must not create a separate `feedback` collection for the same customer feedback domain.

`productId` is populated when the delivered order contains a single product line. `deliveryPartnerId` is read from the stored order assignment when available.

Legacy Phase 12/early Phase 13 Mobile records in `feedback` may be read for backward compatibility only. All new Mobile submissions use `orderFeedback`; the Website option keys are:

```text
orderFeedbackOptions: freshness, packaging, cleanliness, product_quality, value_for_money, quantity, other
deliveryFeedbackOptions: on_time, less_calling, easy_communication, polite_partner, proper_handling, right_location, other
```

## Ownership / Security
- Mobile writes feedback only for the currently authenticated Firebase user.
- The selected order must belong to the logged-in customer and, when the order stores `authUid`, that UID must match the current Firebase session.
- The selected order must already be delivered.
- Feedback reads are scoped to the authenticated Firebase UID and the shared `orderFeedback` contract.
- Feedback images are scoped to `orderFeedback/{authUid}/...` in Firebase Storage.
- Storage rules limit feedback uploads to authenticated owner access, PNG/JPEG content and 5 MB per object.

## Image Upload
Mobile feedback images use the existing Firebase Web SDK Storage client from `services/core/firebaseClient.ts`, matching the project's direct Firebase architecture. `@react-native-firebase/storage` is not used. No Website API is introduced.

The dependency is a runtime native module; it must **not** be added to Expo config plugins manually.

## UI Rules
- Reuse the shared Mobile UI components and design tokens.
- Delivered orders are the source of selectable feedback targets.
- The order detail CTA appears only after delivery.
- Full-screen feedback is customer-native Mobile UX; Website UI is not copied.
- Validation/error states use the shared semantic colors and Button component.

## Validation
Run after dependency installation:

```bash
npm install
npx expo prebuild --platform android --clean
npm run typecheck
npm run check:architecture
npx expo run:android
```

Manual checks:

1. Sign in.
2. Open Feedback with no delivered orders — no feedback form is offered.
3. Open a delivered one-time order and tap `Rate this order`.
4. Submit rating only.
5. Submit rating + comment.
6. Select Packaging/Cleanliness/Freshness options.
7. Select On time/Less calling when a delivery partner is stored.
8. Attach valid PNG/JPG/JPEG images.
9. Verify a >5 MB image is rejected.
10. Verify more than 3 images cannot be attached.
11. Submit feedback and verify it appears in history.
12. Reopen the same delivered order and verify duplicate submission is blocked.
13. Repeat using a delivered subscription delivery order.
14. Verify another customer cannot read or submit feedback for the order.
15. Verify feedback is stored in `orderFeedback` and is visible from the Website feedback/order view.
16. Verify no Website API is introduced for normal feedback data operations.

## Out of Scope
- Public product reviews.
- Admin feedback workflow changes.
- Website notification changes.
- Firebase Functions.
