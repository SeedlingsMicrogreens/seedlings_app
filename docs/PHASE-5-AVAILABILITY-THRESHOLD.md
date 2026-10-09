# Phase 5 — Availability + Production Threshold

## Status
Approved for implementation — 2026-10-05.

## Goal
Implement the Website-equivalent availability, started-batch, production-threshold, full-quantity, next-delivery-date, and high-demand enquiry rules directly in Mobile using Firebase/Firestore.

## Non-negotiable architecture

1. Mobile must NOT call Website APIs for availability or threshold.
2. Mobile reads the required Firestore business data directly.
3. The only Website backend/API exception remains the approved Cashfree/payment processing APIs.
4. Website behaviour is the business-rule reference; Mobile implementation is native.
5. Cart does not reserve or reduce inventory.

## Started-batch rule

- A created but **not-started** growing batch does NOT count as actual available production.
- Started batch statuses follow the Website production state model.
- When a started batch can fulfil the complete requested quantity, it may be used for that delivery date.
- If a started batch is insufficient, continue to the next Saturday and search for the first date where the complete quantity can be fulfilled.
- Do not deliver partial quantity.

## Production threshold fallback

When no started batch exists for a requested production product, use the total active Rack Location threshold.

```text
Existing committed demand for delivery week
                    +
             New requested quantity
                    <=
              Total threshold
```

- Threshold source: `locations` collection.
- Sum `thresholdGrams` from active locations.
- Payment-pending/failed/abandoned orders must NOT count as committed demand.
- Successful/committed subscription and one-time demand counts.

### Within threshold

Accept the availability decision.

### Threshold exceeded

- Mark the result as `highDemand`.
- Do NOT create an order/payment.
- Show a high-demand message.
- Provide **Send Enquiry**.
- Send Enquiry writes directly to `enquiries`; no Contact page/API is used.

## Full-quantity rule

If the customer requests 1000g and only 750g can be fulfilled on the requested date:

- Never deliver 750g.
- Never split the line.
- Search the next Saturday.
- Use the first date where the complete 1000g is available.

Applies to one-time, subscription, and mixed-cart flows.

## Demand calculation

For the requested delivery date:

- Active, payment-committed subscriptions whose `nextDeliveryDate` matches the date count.
- One-time orders whose `scheduledDeliveryDate` matches the date count when payment is committed.
- Subscription orders are not counted again as one-time demand.
- Cancelled/failed/rejected/payment-failed records do not count.
- Combo Products use their component production quantities.

## Multi-item cart

- Subscription items are evaluated before one-time items, matching Website allocation priority.
- Cart order is restored after availability resolution.
- Reservations created during the resolution are in-memory only; inventory is not reserved.
- If one item exceeds the production threshold, the order is not created and the affected item is eligible for enquiry.

## Delivery-date resolution

`resolveCartDeliveryDates()` must return, per cart item:

- requested date
- resolved delivery date or null
- available flag
- high-demand flag
- threshold when applicable

If dates change but the item is otherwise available, Mobile must show a confirmation before proceeding with the updated dates.

## No date within 12 weeks

If no candidate Saturday is available within the next 12 weeks, the result is a customer-contact-required scenario rather than a generic checkout failure.

The Mobile flow must:

- keep the `hasUnavailableItems` result from `resolveCartDeliveryDates()`;
- identify the affected items with `deliveryDate === null`;
- offer a clear message that no delivery slot is available within the next 12 weeks;
- provide a **Send Enquiry** action that writes to the shared `enquiries` collection;
- avoid creating an order or payment;
- preserve customer, product, requested quantity, and delivery context in the enquiry payload.

This is distinct from a network/loading error. A failed availability lookup or timeout is not evidence that there is no date within 12 weeks.

## High-demand enquiry

The enquiry is stored in the shared `enquiries` collection with:

- customer identity
- product ID/name
- requested quantity in grams
- requested delivery date
- reason `HIGH_DEMAND`
- message
- address where available
- `contactRequired: true`

The customer remains on the current flow; do not navigate to a separate Website contact page.

## Product Details rule

Do not show live availability as a Sold Out/Unavailable state. Availability is confirmed during the order/checkout validation.

## Manual verification required before Phase 6

1. No started batch + demand within threshold → accepted.
2. No started batch + demand above threshold → high-demand message.
3. High-demand → Send Enquiry saves enquiry and does not create order/payment.
4. Payment-pending order does not increase committed demand.
5. Started batch with sufficient complete quantity → requested date accepted.
6. Started batch with insufficient quantity → next Saturday is searched.
7. Partial quantity is never accepted.
8. Mixed cart uses correct per-item availability.
9. Mobile availability makes no Website API call.
10. Cart sequence remains unchanged while availability is resolved.

## Implementation notes
- `services/orders/customerOrderAvailability.ts` is the Mobile adaptation of the current Website availability service and uses direct Firestore access.
- `services/orders/customerEnquiryService.ts` writes high-demand enquiries directly to `enquiries`.
- Checkout performs availability resolution before creating pending orders or invoking Cashfree.
- Accepted delivery-date resolutions are persisted on cart items as `deliveryDate` and are used by the order creation service.


## Implementation validation rule — added 2026-10-05

Before a Phase 5 ZIP is handed over for manual testing, the checkout availability call must be syntactically validated, including nested `resolveCartDeliveryDates(...)` and `withTimeout(...)` parentheses. A phase cannot be marked implementation-complete if Expo/Babel reports a syntax error in checkout.


## Subscription Start-Date Alignment

- When a customer selects a subscription start date, availability must be checked/resolved against that selected date, not silently against the next Saturday default.
- The Website flow is the reference: the start date is explicitly selected before subscription creation and must be preserved through resolution, Cart, Checkout and order creation.
