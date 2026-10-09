# Seedlings Mobile — Phase 2 Home

**Status:** Completed
**Date:** 2026-10-05

## 1. Goal

Provide the customer with a stable Mobile Home experience that is a Mobile-native presentation of the established Website customer entry experience.

Home is a navigation/discovery screen. It must not become the place where order-availability, threshold, checkout, or payment business rules are implemented.

## 2. Home Responsibilities

Home may provide:

- Customer greeting
- Product search/navigation
- Featured/popular products
- Product discovery
- One-time shopping entry point
- Subscription entry point
- Navigation to the complete product catalogue
- Navigation to Product Details

Admin-managed product data must come from Firebase/Firestore through the Mobile product service. Do not hardcode product names, prices, packaging, or availability.

## 3. Current Home Flow

```text
Home
  ├── Greeting
  ├── Search
  ├── Featured promotional area
  ├── One-Time entry
  ├── Subscription entry
  └── Popular/featured products
          ↓
      Product Details / Products
```

## 4. Product Cache Rule

Products are cacheable Mobile reference data.

Approved behavior:

```text
Cached products available and cache <= 1 day
        ↓
Show cache immediately

Cache missing/stale
        ↓
Fetch Firestore
        ↓
Save cache
        ↓
Show latest products
```

A background refresh must not be performed on every Home mount when the cache is still valid. This avoids unnecessary Firestore reads and keeps Home deterministic.

If a valid cache exists but a refresh is explicitly requested by a future user action, that refresh may be performed.

## 5. Home Data Boundary

Home must not call Website APIs for product/customer discovery.

Use:

- Firebase/Firestore for products
- Existing Mobile customer service for customer profile data
- Existing Mobile cart store for cart state

Cashfree/payment APIs are not part of Home.

## 6. UX Rules

- Product cards must remain orderable; do not add Sold Out/Currently Unavailable product states.
- Home must not perform threshold acceptance/rejection.
- Home must not reduce inventory.
- Home must not create orders.
- Home must not initiate payment.
- Navigation must preserve existing customer routes.
- Loading/empty states must not crash the screen.

## 7. Phase 2 Scope Boundary

Included:

- Home screen structure
- Greeting
- Search/navigation
- Featured/promotional content already supported by the current Mobile source
- One-time entry
- Subscription entry
- Popular/featured product discovery
- Product cache behavior used by Home

Not included:

- Full Product Catalogue implementation
- Product Detail implementation
- Cart business-rule changes
- Availability/threshold logic
- Checkout
- Payment
- Orders/subscriptions business logic

Those belong to later phases.

## 8. Documentation-First Rule

For Phase 2, this document is updated before implementation. Any change that alters the Home architecture or product data boundary requires this document to be updated first.

## 9. Exit Criteria

- Home loads without Website API dependency.
- Customer greeting works when profile data is available.
- Product discovery navigates correctly.
- One-time and subscription entry points navigate correctly.
- Product cache is used for up to one day.
- No unnecessary background product refresh occurs on every Home mount.
- Home does not implement order/threshold/payment business rules.
- Architecture check passes.
- Typecheck/lint/build are run when dependencies are available.
- CHANGELOG is updated.
