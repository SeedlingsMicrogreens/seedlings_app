/**
 * Mobile side of the Website checkout claim (requests live in paymentService.ts).
 * Pure: no network or Firebase imports. Mirrors the Website's
 * lib/checkoutFingerprint.ts and lib/checkoutClaimFlow.ts so the server builds
 * the same purchase fingerprint from the summary as from the stored orders.
 *
 * The server keeps one pending checkout per customer: the same purchase
 * resumes its existing orders; a changed cart has the old unpaid orders
 * cancelled (`supersededReason: 'cart_changed'`) before new ones are created.
 */

type Data = Record<string, any>;

export type CheckoutSummary = {
  addressId: string;
  oneTime: Array<{ productId: string; packaging: number; quantity: number; deliveryDate: string }>;
  subscriptions: Array<{ productId: string; planId: string; sellingOptionId: string; packaging: number; quantity: number; deliveryDate: string }>;
};

export type ResumeInfo = {
  orderIds: string[];
  subscriptionIds: string[];
  orders: Array<{ id: string; orderNumber: string; total: number; orderType: string; subscriptionId: string; scheduledDeliveryDate: string }>;
  subscriptions: Array<{ id: string; subscriptionNumber: string; frequency: string; nextDeliveryDate: string }>;
};

export type BeginResponse = { action: 'create'; token: string } | { action: 'resume'; resume: ResumeInfo } | { action: 'wait' };

export const CHECKOUT_IN_PROGRESS = 'Checkout is already in progress on another device. Please wait a moment and try again.';

const text = (value: unknown) => String(value ?? '').trim();
const whole = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));

function isSubscriptionOrder(order: Data) {
  return text(order.orderType).toLowerCase() === 'subscription' || Boolean(text(order.subscriptionId));
}

/** Purchase summary built from the order documents about to be written. */
export function summaryFromOrders(orders: Data[]): CheckoutSummary {
  const addressIds = [...new Set(orders.map((order) => text((order.deliveryAddress as Data | undefined)?.id)))];
  const summary: CheckoutSummary = { addressId: addressIds.sort().join('|'), oneTime: [], subscriptions: [] };
  for (const order of orders) {
    const items: Data[] = Array.isArray(order.items) ? order.items : [];
    if (isSubscriptionOrder(order)) {
      const item = items[0] || {};
      summary.subscriptions.push({
        productId: text(item.salableProductId || item.productId),
        planId: text(order.subscriptionPlanId),
        sellingOptionId: text(item.sellingOptionId),
        packaging: whole(item.packaging),
        quantity: whole(item.quantity),
        deliveryDate: text(order.scheduledDeliveryDate),
      });
      continue;
    }
    for (const item of items) {
      summary.oneTime.push({
        productId: text(item.salableProductId || item.productId),
        packaging: whole(item.packaging),
        quantity: whole(item.quantity),
        deliveryDate: text(item.deliveryDate || order.scheduledDeliveryDate),
      });
    }
  }
  return summary;
}

/** Asks the server until it answers create/resume; gives up after `attempts` waits. */
export async function beginCheckoutWithWait(
  begin: (summary: CheckoutSummary) => Promise<BeginResponse>,
  summary: CheckoutSummary,
  options: { attempts?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<Exclude<BeginResponse, { action: 'wait' }>> {
  const attempts = options.attempts ?? 14;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    const response = await begin(summary);
    if (response.action !== 'wait') return response;
    if (attempt < attempts) await sleep(options.delayMs ?? 1500);
  }
  throw new Error(CHECKOUT_IN_PROGRESS);
}
