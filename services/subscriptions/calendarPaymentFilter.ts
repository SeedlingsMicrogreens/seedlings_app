/** Payment statuses that represent a server-confirmed successful payment. */
export function isPaidPaymentStatus(status: unknown): boolean {
  const normalized = String(status ?? '').trim().toLowerCase();
  return normalized === 'paid' || normalized === 'success' || normalized === 'successful';
}

export function filterPaidCalendarSubscriptions<T extends { paymentStatus?: string }>(subscriptions: T[]): T[] {
  return subscriptions.filter((subscription) => isPaidPaymentStatus(subscription.paymentStatus));
}

/**
 * Keep actual delivery records only when their parent subscription is paid and,
 * when an order ID is present, that linked order is also paid. Missing linked
 * orders fail closed rather than exposing pending/failed orders in the calendar.
 */
export function filterPaidCalendarDeliveries<
  D extends { subscriptionId?: string; orderId?: string },
  S extends { id: string; paymentStatus?: string },
  O extends { id: string; paymentStatus?: string },
>(deliveries: D[], subscriptions: S[], orders: O[]): D[] {
  const paidSubscriptionIds = new Set(
    filterPaidCalendarSubscriptions(subscriptions).map((subscription) => subscription.id),
  );
  const paidOrderIds = new Set(
    orders.filter((order) => isPaidPaymentStatus(order.paymentStatus)).map((order) => order.id),
  );

  return deliveries.filter((delivery) => {
    if (!delivery.subscriptionId || !paidSubscriptionIds.has(delivery.subscriptionId)) return false;
    if (delivery.orderId && !paidOrderIds.has(delivery.orderId)) return false;
    return true;
  });
}
