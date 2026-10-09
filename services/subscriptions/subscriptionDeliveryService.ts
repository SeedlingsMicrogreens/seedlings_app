import { collection, getDocs, query, where } from '../core/firestore';
import { auth, db } from '../core/firebaseClient';
import { getCustomerIdToken } from '../core/customerAuth';

export type DeliveryAction = 'reschedule';

export type SubscriptionDelivery = {
  id: string;
  subscriptionId: string;
  orderId?: string;
  deliveryNumber?: number;
  customerId?: string;
  productName?: string;
  quantity?: number;
  deliveryDate?: string;
  status?: string;
  rescheduledToDate?: string;
  rescheduledFromDate?: string;
};

function websiteApiBaseUrl() {
  const value = process.env.EXPO_PUBLIC_WEBSITE_API_URL?.trim().replace(/\/$/, '');
  if (!value) throw new Error('Delivery service is not configured.');
  return value;
}

function dateOnly(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  return value;
}

export async function getCustomerSubscriptionDeliveries(mobile: string): Promise<SubscriptionDelivery[]> {
  const normalized = String(mobile).replace(/\D/g, '');
  if (!normalized) return [];
  const snapshot = await getDocs(query(collection(db, 'subscriptionDeliveries'), where('customerId', '==', normalized)));
  return snapshot.docs.map((item) => {
    const data = item.data();
    return {
      id: item.id,
      subscriptionId: String(data.subscriptionId ?? ''),
      ...(data.orderId ? { orderId: String(data.orderId) } : {}),
      ...(data.deliveryNumber != null ? { deliveryNumber: Number(data.deliveryNumber) } : {}),
      ...(data.customerId ? { customerId: String(data.customerId) } : {}),
      ...(data.productName ? { productName: String(data.productName) } : {}),
      ...(data.quantity != null ? { quantity: Number(data.quantity) } : {}),
      ...(data.deliveryDate ? { deliveryDate: dateOnly(data.deliveryDate) || undefined } : {}),
      ...(data.status ? { status: String(data.status) } : {}),
      ...(data.rescheduledToDate ? { rescheduledToDate: dateOnly(data.rescheduledToDate) || undefined } : {}),
      ...(data.rescheduledFromDate ? { rescheduledFromDate: dateOnly(data.rescheduledFromDate) || undefined } : {}),
    };
  });
}

export async function updateSubscriptionDelivery(input: {
  subscriptionId: string;
  action: DeliveryAction;
  deliveryDate: string;
  newDate?: string;
}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Your login session expired. Please sign in again.');
  const token = await getCustomerIdToken(true);
  const response = await fetch(`${websiteApiBaseUrl()}/api/subscriptions/delivery-action`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  let payload: any = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok) throw new Error(String(payload?.error || 'Unable to update delivery.'));
  return payload as Record<string, unknown>;
}
