# Seedlings Mobile — Phase 9.1 Cashfree Mixed Order Alignment

## Objective

Align Mobile payment orchestration exactly with the current Website Cashfree implementation for:

- One-time only checkout
- Subscription only checkout
- Mixed one-time + subscription checkout

## MD-first Decision

The latest Website API already supports the required flow. No Website API change is required for this alignment.

The existing API contract is:

```text
POST /api/cashfree/create-payment-session
{
  orderIds: string[],
  customerMobile: string
}
```

The Website combines the totals of all supplied internal orders into **one Cashfree order** and stores all internal order IDs against the payment attempt.

## Required Mobile Behavior

### One-time

```text
one-time order
    ↓
orderIds = [oneTimeOrderId]
    ↓
ONE Cashfree order
```

### Subscription

```text
subscription order
    ↓
orderIds = [subscriptionOrderId]
    ↓
ONE Cashfree order
```

### Mixed

```text
one-time order(s)
      +
subscription order(s)
      ↓
orderIds = [all internal order IDs]
      ↓
ONE Cashfree order
```

## Finalization

The Cashfree payment is server-authoritative.

```text
Cashfree
   ↓
Webhook / server verification
   ↓
All internal order IDs linked to payment attempt
   ↓
one-time orders → confirmed
subscription orders → active
```

A Mobile SDK callback is only a signal to request authoritative server status.

## Idempotency

- Do not create separate Cashfree payments for one-time and subscription portions of a mixed checkout.
- Persist the complete internal `orderIds` list with the payment attempt.
- Reuse an existing pending Cashfree session where the Website API supports it.
- Do not clear pending payment state until an authoritative paid/failed result is received.
- A failed or unresolved payment must not activate a subscription.

## Implementation Decision

The Mobile `createCashfreePaymentSession(orderIds, customerMobile)` function is the single payment-session entry point for all three checkout types.

No separate subscription Cashfree API is permitted.

No new Website API is permitted unless the existing contract stops supporting the required order set.

## Validation

The implementation must verify that:

1. One-time checkout sends its order ID.
2. Subscription checkout sends its order ID.
3. Mixed checkout sends every created order ID.
4. Only one Cashfree payment session is created for a mixed checkout.
5. The Website API receives the full `orderIds` array.
6. Server finalization processes every linked internal order.

## Scope Boundary

This phase does not change:

- Firebase architecture
- Firestore business rules
- Inventory rules
- Cashfree webhook architecture
- Website payment business logic
- Subscription business rules
