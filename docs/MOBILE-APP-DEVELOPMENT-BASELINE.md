# Seedlings Mobile App — Development Baseline

**Status:** Approved development baseline  
**Date:** 2026-10-05

This document is the primary scope and architecture guardrail for continuing Seedlings Mobile development.

## 1. Goal

The Mobile App must provide the **same customer-facing functionality and business behavior available on the Seedlings Website**, but with a proper React Native / Expo Mobile implementation and Mobile UX.

The goal is **not** to copy Website code or Website UI.

```text
Website
  ↓
Reference for customer functionality + business rules
  ↓
Mobile
  ↓
Native Mobile implementation + Mobile UX
```

## 2. Backend / API Boundary — NON-NEGOTIABLE

Phase 0 architecture details are maintained in `docs/PHASE-0-FOUNDATION-ARCHITECTURE.md`.

Mobile uses the shared Seedlings Firebase/Firestore business data.

### Mobile MUST NOT use Website APIs for normal customer functionality:

- Customer profile
- Addresses
- Products
- Packaging
- Selling options
- Cart
- Availability
- Production threshold
- Delivery-date calculation
- Orders
- Subscriptions
- Notifications
- Feedback
- Other normal customer data/business operations

### Website/server API exceptions

Two narrowly scoped server-side exceptions are approved:

1. **Cashfree/payment processing** — existing payment architecture.
2. **Customer authentication** — shared Final UAT 4-digit OTP API implemented by Website and consumed by Mobile.

Authentication uses the server only for:

```text
OTP generation
OTP storage/expiry/invalidation
OTP verification
server-side SMS
Firebase Admin identity resolution
Firebase Admin createCustomToken()
```

The authentication API is a shared customer-authentication boundary, not a general Website backend dependency.

These exceptions must not be expanded into general Website API usage.

### Website/server API exceptions — PAYMENT + AUTHENTICATION

The existing Website backend/API used for **Cashfree/payment processing** will remain in use.

```text
Mobile
   ↓
Existing Website payment API
   ↓
Cashfree / server-side payment processing
```

This exception exists because Cashfree secrets and authoritative payment finalization must remain server-side.

Do NOT expand this exception into general Website API usage.

### Never put these in Mobile

- Firebase Admin credentials
- Firebase service-account private key
- Cashfree secret key
- Cashfree webhook secret
- Other server-only secrets

## 3. Authentication Boundary

Authentication uses the approved Final UAT server-side OTP architecture.

```text
Mobile
   ↓
Authentication OTP API
   ↓
Generate/store/verify 4-digit OTP
   ↓
Demo → return generated OTP
Real  → server-side SMS
   ↓
Firebase Admin createCustomToken()
   ↓
Mobile signInWithCustomToken()
   ↓
Firebase Auth session
```

Demo and Real modes use the same authentication API contract.

The following are prohibited:

- fixed `1234`
- Firebase Phone Authentication
- Firebase-generated 6-digit OTP
- `signInWithPhoneNumber()`
- `verifyPhoneNumber`
- `PhoneAuthProvider`
- `RecaptchaVerifier`
- Firebase Anonymous Auth as customer login
- Mobile-side OTP verification
- direct SMS provider calls from Mobile
- SMS credentials in Mobile
- Firebase Admin credentials in Mobile

Refer to `docs/MOBILE-AUTHENTICATION-DECISION.md` for the authoritative authentication decision.

## 4. Customer Functionality Scope

Mobile development must cover all customer-facing Website functionality, including:

### Authentication & Customer

- Login / OTP
- Session restore
- Logout
- Customer onboarding
- Profile
- **Profile photo** — select/capture, upload, preview/change/remove, stored photo URL
- Addresses
- Default address

### Home

- Featured products
- Offers/promotions where configured
- Product navigation
- Delivery information

### Products

- Product listing
- Product details
- Product images
- MRP and selling price
- Packaging options
- One-time selling option
- Subscription selling option
- Quantity selection

### Cart

- One-time items
- Subscription items
- Mixed cart
- Packaging
- Quantity increase/decrease/remove
- Delivery dates
- Delivery charge
- Cart totals

### Production Availability & Threshold

This is a **separate core feature**, not merely a UI availability check.

#### Started-batch rule

- A created but **not-started** batch does NOT count as actual available production.
- A started batch uses the existing batch/order availability logic.
- If started-batch availability is insufficient, continue the existing next-date search for the complete requested quantity.
- If no started batch exists, use threshold fallback.

#### Threshold fallback

Use the total threshold configured in Rack Locations.

```text
Existing demand for delivery week
              +
New requested quantity
              <=
Total threshold
```

If the result is within threshold:

- Accept the order.

If the result exceeds threshold:

- Do NOT place the order.
- Show the high-demand message.
- Show **Send Enquiry**.
- Send Enquiry saves the enquiry directly.
- Do not navigate to a separate contact page for this flow.

#### Full quantity rule

If customer requests 1000g and only 750g is available:

- Do NOT deliver 750g.
- Do NOT split the order line.
- Find the next date where the complete 1000g can be fulfilled.

This applies to:

- One-time orders
- Subscription deliveries
- Mixed carts

### Checkout

- Address selection
- Delivery-date selection/resolution
- One-time checkout
- Subscription checkout
- Mixed checkout
- Unique actual delivery-date delivery-charge calculation
- Final payable amount
- Payment initiation

### Payment

- Cashfree Mobile SDK
- Payment session
- Success
- Failure
- Abandonment
- Retry
- Duplicate-payment protection
- Callback/webhook race handling
- App closed during payment
- Reconciliation after app resume

Payment must remain server-authoritative.

### Orders

- My Orders
- Order list
- Order details
- Order status/history
- Products/packaging
- Delivery date
- Payment information
- Delivery information

### Subscriptions

- My Subscriptions
- Subscription details
- Subscription products
- Upcoming deliveries
- Delivery schedule
- Payment status
- Subscription history

Pause Subscription, Cancel Subscription and Skip Delivery are prohibited in the customer UI and action paths. Reschedule Delivery is the only supported delivery-change action.

> **Requires owner decision (recorded 2026-10-09):** `docs/PHASE-9-SUBSCRIPTIONS.md` allows pause/resume/cancel and the current source (`app/(customer)/account/subscriptions.tsx`) implements Pause/Resume/Cancel. This conflict is unresolved; current runtime behavior is preserved until the owner decides. Skip Delivery remains prohibited.

### Delivery Calendar / Journey

- Upcoming deliveries
- Past deliveries
- Delivery status
- Customer journey

### Notifications

- Notification bell
- Unread count
- Notification list
- All / Unread filter
- Read/unread state
- Mark all as read
- Order/subscription navigation
- Transaction notifications
- Admin notifications
- Push notification handling

**Admin changes required to send Mobile push notifications are out of the current Mobile scope and will be handled later.**

### Feedback

- Feedback for delivered orders
- Rating
- Comment
- Packaging / cleanliness / freshness feedback
- Delivery-partner feedback
- Image upload and validation

## 5. Core Business Rules

Mobile must preserve the approved Seedlings business rules.

### Inventory

```text
Add to Cart
  ↓
No inventory reduction

Pending payment
  ↓
No inventory reduction

Successful payment
  ↓
Server-side order/inventory finalization

Handover
  ↓
Batch Sold Quantity update
```

Mobile must not create a second inventory commitment system.

### Delivery charge

Delivery charge is calculated once per **unique actual delivery date** across the complete checkout.

Examples:

- One one-time delivery date → one charge.
- Two one-time products on same date → one charge.
- Two different dates → charge for both dates.
- Subscription → one charge per unique subscription delivery date.
- Multiple subscriptions sharing a date → one charge for that date.
- One-time + subscription → one charge per unique date.

Do not reintroduce the old subscription-plan delivery-charge override.

### Payment lifecycle

```text
Payment SUCCESS
   ↓
Server confirms payment
   ↓
Order confirmed
   ↓
Cart reconciled/cleared
```

Do not clear the cart merely because Cashfree opened or a Mobile callback says success.

Payment failure keeps the cart available.

Retry must not create duplicate business orders.

## 6. Cross-App Source-of-Truth Rule

For customer functionality:

1. Inspect the current Website behavior.
2. Identify the actual business rule/data model.
3. Check Admin configuration when relevant.
4. Implement the equivalent Mobile behavior.
5. Do not copy Website implementation details unnecessarily.

Website is the **functional/business reference**, not the Mobile backend.

Admin remains the source of Admin-managed values such as products, packaging, selling options, subscription plans, delivery charges, offers, and production configuration.

## 7. Development Order

Develop in this order to minimize rework:

```text
M1  Authentication + customer onboarding
M2  Home
M3  Product catalogue + product details
M4  Cart
M5  Production availability + threshold + delivery-date resolution
M6  Checkout + delivery charge
M7  Cashfree payment + reconciliation
M8  Orders + Order Details
M9  Subscriptions
M10 Delivery Calendar / Journey
M11 Profile + addresses + profile photo
M12 Notifications
M13 Feedback
M14 Full integration + regression + release validation
```

Threshold must be completed before Checkout because it affects whether an order can proceed and which delivery date can be selected.

## 8. Phase 2 — Home

The Home phase is governed by `docs/PHASE-2-HOME.md`. Home is a discovery/navigation screen and must not implement threshold, checkout, payment, or order-finalization logic.

## 8. Documentation-First Rule

Before starting each feature:

1. Update the relevant Mobile MD if the feature introduces or changes architecture, scope, data flow, or business rules.
2. Inspect the latest Mobile source ZIP/repository.
3. Inspect the relevant Website/Admin behavior.
4. Implement only after the MD and source are aligned.
5. Validate the feature and adjacent flows.
6. Update `CHANGELOG.md`.

If implementation reveals that the approved architecture is insufficient, **stop implementation, update the MD first, then continue**.

## 9. Explicitly Out of Scope

Do not implement or reintroduce these unless explicitly requested:

- General Website API dependency
- General Website authentication dependency outside the approved OTP API
- Website CORS dependency for Mobile login
- Any custom-token flow implemented outside the approved server authentication API
- Separate Mobile customer identity system
- Firebase Admin credentials in Mobile
- Cashfree secrets in Mobile
- Admin Mobile-push implementation
- Pause Subscription UI
- Cancel Subscription UI
- Skip Delivery UI or action handler (prohibited)
- Partial delivery
- Split delivery
- Product-level Sold Out / Currently Unavailable state

## 10. Definition of Done

A Mobile feature is complete only when:

- It follows this baseline.
- It does not introduce an unauthorized Website API dependency.
- Website business behavior is matched where applicable.
- Admin-managed values are not hardcoded.
- Firebase/Firestore data remains compatible with Website/Admin.
- Security boundaries are preserved.
- Relevant payment/inventory/order rules are preserved.
- Typecheck/lint/build are run when dependencies are available.
- Relevant functional regression is completed.
- Documentation/changelog is updated.

## Phase 1 Status — 2026-10-05

Phase 1 Customer Authentication is the current completed development phase.

Reference:
- `docs/PHASE-1-CUSTOMER-AUTHENTICATION.md`

Manual runtime verification is required before Phase 2 begins.

## Phase 3 Completion

Phase 3 Product Catalogue & Product Details is completed. See `docs/PHASE-3-PRODUCT-CATALOGUE.md` for scope and exit criteria.

## Phase 3 Purchase Flow Alignment

Product Details must follow the Website customer purchase pattern. Do not introduce a Mobile-only separate subscription modal/screen when purchase options can be presented on the Product Details screen. Packaging is selected first, followed by One-time or Subscription plan selection, then Add to Cart.

Subscription plans are Product-specific: Mobile must filter active plans by the current salable Product using the Website subscription-plan field `salableProductId` before displaying them. A plan belonging to another Product must never appear. Where the plan contains a selling-option-specific `planPrice`, that price must be used for the matching Product selling option.


## Phase 4 — Cart

See `docs/PHASE-4-CART.md`. Mobile Cart must follow the Website customer flow: Product-wise packaging selector, one-time/subscription purchase options, Product-specific subscription plans, quantity controls, mixed cart support, no cart-level delivery charge/order summary, and Proceed to Checkout only.

## Phase 5 implementation baseline
- Availability uses direct Firestore and includes active Rack Location threshold totals.
- High-demand threshold failures never create orders/payments and can create shared enquiries directly.
- Full requested quantity must be available; otherwise Mobile resolves a later Saturday for started-batch shortages.


## Phase 12 Status

Phase 12 Notifications is implemented on the Mobile baseline. It uses the existing Website notification/FCM contract, adds Android FCM token registration, real-time in-app notification state, read-state actions, and notification navigation.

The Website Firestore rule for `customerPushSubscriptions` must accept `android` and `ios` in addition to `web`; no new Website API or Firebase Function is introduced.
