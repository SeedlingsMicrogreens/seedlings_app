# Seedlings Mobile — Phase 12: Notifications

## Objective
Implement the customer notification experience using the shared Firebase/Firestore architecture and the existing Website notification contract.

## Scope
- Real-time in-app notification center.
- Unread count and unread visual state.
- Mark one notification as read.
- Mark all notifications as read.
- Open related order/subscription from a notification.
- Android FCM push-token registration tied to the authenticated Firebase UID/customer mobile.
- Token refresh handling.
- FCM token invalidation during customer logout so a device token is not left associated with the previous customer.
- Foreground notification feedback inside the shared root UI.
- Background/closed-app push delivery through the existing Website FCM sender.
- Push tap recovery to the related order/subscription/notification center.

## Notification Data Contract
The Mobile app consumes the existing `notifications` collection fields used by the Website:

```text
recipientCustomerId
recipientUid
title
message
event
source
type
orderId
orderNumber
subscriptionId
read
readAt
createdAt
```

The existing Website creates notification records and sends FCM push notifications. Mobile does not create transactional notification records.

## Push Token Contract
Mobile stores an FCM registration token in:

```text
customerPushSubscriptions/{android_<stable-token-hash>}
```

Fields:

```text
token
customerId
authUid
platform = android
active
updatedAt
```

The token is registered only for the currently authenticated customer. Token refresh replaces the stored token registration.

## Authentication / Ownership
Notification reads and read-state updates remain protected by Firebase Security Rules. Mobile never trusts notification visibility as a security boundary. Push token registration must use the current Firebase Auth UID and the same customer identity used by the Website notification sender.

## Push Behavior
- Android permission is requested through native Firebase Messaging after an authenticated customer session is restored.
- Background/terminated push messages are delivered by FCM using the existing Website server payload.
- Foreground messages are surfaced through the shared root notification toast; the Firestore notification record remains the source of truth.
- Opening a push notification resolves the notification record and navigates to the related order, subscription, or notification center.
- If push permission is denied/unavailable, the in-app notification center continues to work.

## Architecture Constraints
- Firebase Authentication + Firestore remain the normal Mobile data boundary.
- No Firebase Functions.
- No new Website REST API is introduced for notification functionality.
- Cashfree remains the approved payment API exception; customer authentication has a separate, narrowly scoped Final UAT authentication API exception documented in `docs/MOBILE-AUTHENTICATION-DECISION.md`.
- Website server remains responsible for creating notification records and sending FCM push notifications.
- Do not store server credentials or FCM server credentials in Mobile.

## UI Rules
- Reuse the shared Mobile UI system.
- No screen-specific notification styling framework.
- Unread notifications use the existing green semantic palette.
- Notification actions use the shared Button component where a button is required.
- Notification cards are touchable across their full surface.

## Definition of Done
- Notification center loads customer-owned notifications.
- New notifications appear without requiring manual navigation refresh.
- Unread count/state is correct.
- Mark-read and mark-all-read work.
- Related order/subscription navigation works.
- Android FCM token is registered and refreshed.
- Existing Website FCM sender can deliver to the Mobile token.
- Foreground/background/tap behavior is handled.
- Permission denial does not break the notification center.
- Typecheck/native build validation completed where dependencies/environment permit.
- Changelog and handover updated.
