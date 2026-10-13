import { collection, doc, getDoc, getDocs, onSnapshot, query, updateDoc, where, serverTimestamp, setDoc } from '../core/firestore';
import { db, auth } from '../core/firebaseClient';

export type CustomerNotification = {
  id: string;
  title: string;
  message: string;
  type?: string;
  source?: string;
  event?: string;
  read?: boolean;
  createdAt?: unknown;
  readAt?: unknown;
  orderId?: string;
  orderNumber?: string;
  subscriptionId?: string;
};

export const CUSTOMER_NOTIFICATIONS_ROUTE = '/(customer)/account/notifications' as const;

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function toDateValue(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'object' && value !== null && 'toMillis' in value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Date.parse(value) || 0;
  return 0;
}

function mapNotification(id: string, data: Record<string, unknown>): CustomerNotification {
  return {
    id,
    title: asString(data.title) ?? asString(data.heading) ?? 'Notification',
    message: asString(data.message) ?? asString(data.body) ?? asString(data.description) ?? '',
    type: asString(data.type),
    source: asString(data.source),
    event: asString(data.event),
    read: data.read === true || data.isRead === true,
    readAt: data.readAt,
    createdAt: data.createdAt ?? data.timestamp ?? data.sentAt,
    orderId: asString(data.orderId),
    orderNumber: asString(data.orderNumber),
    subscriptionId: asString(data.subscriptionId),
  };
}

export async function getCustomerNotifications(mobile: string): Promise<CustomerNotification[]> {
  const normalizedMobile = mobile.replace(/\D/g, '');
  if (!normalizedMobile) return [];
  const authUid = auth.currentUser?.uid;
  const queries = [
    getDocs(query(collection(db, 'notifications'), where('recipientCustomerId', '==', normalizedMobile))),
    ...(authUid ? [getDocs(query(collection(db, 'notifications'), where('recipientUid', '==', authUid)))] : []),
  ];
  const snapshots = await Promise.all(queries);
  const map = new Map<string, CustomerNotification>();
  snapshots.forEach((snapshot) => snapshot.docs.forEach((item) => map.set(item.id, mapNotification(item.id, item.data() as Record<string, unknown>))));
  return [...map.values()].sort((a, b) => toDateValue(b.createdAt) - toDateValue(a.createdAt));
}

export function subscribeToCustomerNotifications(
  mobile: string,
  onChange: (items: CustomerNotification[]) => void,
  onError?: (error: Error) => void,
) {
  const normalizedMobile = mobile.replace(/\D/g, '');
  const authUid = auth.currentUser?.uid;
  if (!normalizedMobile || !authUid) {
    onChange([]);
    return () => {};
  }

  const byCustomer = query(collection(db, 'notifications'), where('recipientCustomerId', '==', normalizedMobile));
  const byUid = query(collection(db, 'notifications'), where('recipientUid', '==', authUid));
  let customerItems: CustomerNotification[] = [];
  let uidItems: CustomerNotification[] = [];
  const publish = () => {
    const map = new Map<string, CustomerNotification>();
    [...customerItems, ...uidItems].forEach((item) => map.set(item.id, item));
    onChange([...map.values()].sort((a, b) => toDateValue(b.createdAt) - toDateValue(a.createdAt)));
  };
  const unsubscribeCustomer = onSnapshot(byCustomer, (snapshot) => {
    customerItems = snapshot.docs.map((item: any) => mapNotification(item.id, item.data() as Record<string, unknown>));
    publish();
  }, onError);
  const unsubscribeUid = onSnapshot(byUid, (snapshot) => {
    uidItems = snapshot.docs.map((item: any) => mapNotification(item.id, item.data() as Record<string, unknown>));
    publish();
  }, onError);
  return () => { unsubscribeCustomer(); unsubscribeUid(); };
}

export async function markCustomerNotificationRead(id: string): Promise<void> {
  await updateDoc(doc(db, 'notifications', id), { read: true, readAt: serverTimestamp() });
}

export async function markAllCustomerNotificationsRead(items: CustomerNotification[]): Promise<void> {
  await Promise.all(items.filter((item) => !item.read).map((item) => markCustomerNotificationRead(item.id)));
}

export async function getCustomerNotificationById(id: string): Promise<CustomerNotification | null> {
  const snapshot = await getDoc(doc(db, 'notifications', id));
  return snapshot.exists() ? mapNotification(snapshot.id, snapshot.data() as Record<string, unknown>) : null;
}

export function notificationCreatedAt(item: CustomerNotification): number {
  return toDateValue(item.createdAt);
}

export function notificationUnreadCount(items: CustomerNotification[]): number {
  return items.reduce((count, item) => count + (item.read ? 0 : 1), 0);
}

export function notificationUnreadBadgeLabel(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > 99 ? '99+' : String(count);
}

export async function registerCustomerPushToken(mobile: string, token: string): Promise<void> {
  const normalizedMobile = mobile.replace(/\D/g, '');
  const uid = auth.currentUser?.uid;
  if (!normalizedMobile || !uid || !token) return;
  const id = `android_${tokenHashId(token)}`;
  await setDoc(doc(db, 'customerPushSubscriptions', id), {
    token,
    customerId: normalizedMobile,
    authUid: uid,
    platform: 'android',
    active: true,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

function tokenHashId(token: string): string {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
