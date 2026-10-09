import { collection, getDocs, query, where } from '../core/firestore';
import { db } from '../core/firebaseClient';

export type DeliverySlot = {
  id: string;
  name: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  deliveryCharge?: number;
  active: boolean;
  sortOrder?: number;
};

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeSlot(id: string, raw: Record<string, unknown>): DeliverySlot {
  return {
    id,
    name: stringValue(raw.name ?? raw.label ?? raw.title) || 'Delivery Slot',
    date: stringValue(raw.date ?? raw.deliveryDate) || undefined,
    startTime: stringValue(raw.startTime ?? raw.from) || undefined,
    endTime: stringValue(raw.endTime ?? raw.to) || undefined,
    deliveryCharge: numberValue(raw.deliveryCharge ?? raw.deliveryFee ?? raw.charge),
    active: raw.active !== false && raw.isActive !== false,
    sortOrder: numberValue(raw.sortOrder),
  };
}

export async function getDeliverySlots(): Promise<DeliverySlot[]> {
  const snapshot = await getDocs(query(collection(db, 'deliverySlots'), where('active', '==', true)));
  return snapshot.docs
    .map((doc) => normalizeSlot(doc.id, doc.data() as Record<string, unknown>))
    .filter((slot) => slot.active)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}
