# Seedlings Mobile — Cross-Application Source of Truth

## Purpose

The Mobile app is developed against the same customer business behaviour as the Seedlings Website, while respecting the operational/data rules maintained by the Admin Portal.

This document defines how the three application codebases and their documentation are used together so that Mobile development does not rely on assumptions or incomplete phase memory.

## Source hierarchy

When implementing or changing Mobile functionality, use the following order:

1. **Current Mobile source code and Mobile-specific permanent rules** — authoritative for Mobile implementation details and platform constraints.
2. **Current Website source + the Website reference documents in `docs/reference/WEBSITE-CURRENT-STATE.md`** — authoritative for customer-facing business behaviour, customer UX decisions, cart/checkout/subscription/payment flows, and Website parity requirements.
3. **Current Admin source + the Admin reference documents in `docs/reference/ADMIN-CURRENT-STATE.md`** — authoritative for operational data models, production/inventory/fulfilment/delivery rules, Firestore collections, and admin-side business constraints.

## Mobile parity rule

When a customer feature already exists on the Website, implement the Mobile feature with the **same business rules and outcomes** unless a Mobile-specific platform constraint requires a different implementation mechanism.

A different Mobile UI implementation is acceptable when required by native/mobile UX, but the following must remain aligned with Website behaviour:

- business rules
- validation
- cart meaning and item behaviour
- product/selling-option meaning
- subscription behaviour
- delivery-date logic
- checkout totals and delivery-charge rules
- payment lifecycle
- order/subscription outcomes
- customer enquiry/contact-required outcomes
- authentication/customer ownership rules

Do not invent a second business rule merely because the Mobile codebase currently implements something differently.

## Admin alignment rule

Mobile must not mutate operational data in a way that conflicts with Admin rules.

Examples:

- Inventory remains gram-based.
- Creating a customer cart does not consume inventory.
- Pending/failed/abandoned payment does not commit inventory.
- Packing consumes inventory; handover/delivery does not perform a second inventory deduction.
- Customer-contact-required cases are not represented as normal completed orders.
- Product and Microgreen remain distinct concepts.
- Product selling options define customer packaging/selling choices.

The exact current rules must always be checked in the Admin reference documents and current Admin source before implementing a Mobile feature that interacts with these areas.

## Delivery availability / future batch rule

The Website's current smart delivery behaviour is the reference for Mobile customer checkout parity.

In particular:

- If the requested quantity can be fulfilled on the requested date, no availability confirmation is required.
- If an actual availability/date adjustment is required, show the equivalent confirmation flow and preserve the Website Yes/No outcomes.
- **A future batch not existing yet is not by itself an availability failure.** For example, an order requested for 17 Oct may proceed even if the 17 Oct batch has not yet been created; the relevant production requirement is considered when future production/batch planning occurs.
- Customer-contact-required behaviour must follow the Website flow and Admin enquiry model.

## Payment rule

Cashfree remains server-authoritative. Mobile must not contain Cashfree secret credentials or independently decide that a payment succeeded.

The Mobile implementation must use the existing approved backend/payment bridge and preserve the Website payment lifecycle semantics.

## Authentication decision

Mobile authentication is governed by `docs/MOBILE-AUTHENTICATION-DECISION.md`.

The approved Final UAT architecture is:

```text
Mobile
   ↓
Authentication OTP API
   ↓
Server-generated 4-digit OTP
   ↓
Demo → return generated OTP
Real  → server-side SMS provider
   ↓
Server-side OTP verification
   ↓
Firebase Admin createCustomToken()
   ↓
Mobile signInWithCustomToken()
```

Authentication is a shared, narrowly scoped server-side API used by both Website and Mobile. It does not make Mobile a general Website-API client.

The following remain prohibited:

- Firebase Phone Authentication
- Firebase-generated 6-digit OTP
- fixed `1234`
- Mobile-side OTP verification
- Firebase Anonymous Auth as the customer-login mechanism
- direct Mobile-to-SMS-provider calls

Authentication architecture changes must update the authentication decision document **before code implementation**.

## Documentation maintenance

For every permanent cross-application business decision:

- update the appropriate Website/Admin source documentation if the decision belongs to those systems;
- update this Mobile cross-application document when the decision affects Mobile implementation;
- update the Mobile changelog for the completed change;
- do not create new phase-specific README files for normal feature work.

## Before implementing a Mobile feature

1. Inspect the latest Mobile source.
2. Read `docs/reference/WEBSITE-CURRENT-STATE.md`.
3. Read `docs/reference/ADMIN-CURRENT-STATE.md`.
4. Inspect the actual Website/Admin implementation when the documentation is insufficient or conflicts with source.
5. Identify the exact business rule and expected outcome.
6. Implement the Mobile equivalent without silently changing the business rule.
7. Validate Mobile typecheck/build where the environment permits.
8. Update documentation/changelog when the feature creates a new permanent decision.

## Documentation-first implementation rule

For every new Mobile feature or architectural change:

1. Update the relevant Markdown decision/current-state document first.
2. Define the approved flow, boundaries, dependencies, and non-negotiable rules.
3. Implement only after the documentation is updated.
4. If implementation exposes a genuine architectural gap, update the Markdown first and then continue.

Do not implement first and document the decision afterward.

## No-assumption rule

Do not infer a business rule from a single Mobile screen, an old phase README, a UI label, or a partial implementation. When behaviour depends on Website/Admin logic, use the current cross-application references and source code.

---

# Mobile API Boundary — 2026-10-08

The Mobile App is NOT a Website-API client.

Website behavior is used as the functional/business reference, but Mobile customer operations must use the shared Firebase/Firestore architecture or a Mobile-safe backend mechanism.

The approved Website/server API dependencies are narrowly scoped:

1. Existing Cashfree/payment processing.
2. The new Final UAT authentication OTP API documented in `docs/MOBILE-AUTHENTICATION-DECISION.md`.

Authentication is an explicit exception because OTP/SMS/Firebase Admin operations require a trusted server boundary.

Do not use Website APIs for:

- profile / addresses
- products
- packaging / selling options
- cart
- availability / threshold
- delivery-date calculation
- orders
- subscriptions
- notifications
- feedback

This rule is mandatory for future Mobile development.

See `docs/MOBILE-APP-DEVELOPMENT-BASELINE.md` for the complete Mobile scope, feature order, and architecture guardrails.

## Phase 0 architecture boundary

Mobile must use Firebase/Firestore directly for normal customer functionality. The Website API is not a general Mobile backend. The approved server-side exceptions are the existing Cashfree/payment-processing flow and the narrowly scoped Final UAT authentication OTP API. See `docs/PHASE-0-FOUNDATION-ARCHITECTURE.md` and `docs/MOBILE-AUTHENTICATION-DECISION.md`.

## Phase 5 — Availability and Threshold
The Website `customerOrderAvailability` implementation is the business-rule reference. Mobile adapts the same rules to direct Firebase/Firestore access. The Website threshold API is not used by Mobile.


## Website behavior reference

Website is the behavioral source of truth for customer-visible purchase flows. Mobile must match Website for subscription start-date selection, checkout pricing/offers, payment-state continuity and feedback data contracts. The Subscription management page shows the customer's existing subscriptions; it does not act as an available-plan marketplace. Available plans are selected from Product Detail.
