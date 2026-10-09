import { collection, getDocs } from '../core/firestore';
import { db } from '../core/firebaseClient';

const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const nonNegative = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export type DeliveryChargeResult = {
  finalCharge: number;
  baseCharge: number;
  savings: number;
  isFree: boolean;
  source: 'geolocation' | 'delivery_master' | 'subscription_plan' | 'none';
  sourceId: string;
  sourceName: string;
  snapshot: Record<string, unknown>;
};

export type CheckoutDeliveryCharges = {
  oneTime: DeliveryChargeResult;
  subscriptions: Array<DeliveryChargeResult & { planId: string; planName: string }>;
  oneTimeTotal: number;
  subscriptionTotal: number;
  total: number;
  savingsTotal: number;
};

export type CheckoutDateCharge = {
  deliveryDate: string;
  charge: number;
  source: DeliveryChargeResult['source'];
  sourceId: string;
  sourceName: string;
};

export type UniqueDateCheckoutDeliveryCharges = {
  dates: string[];
  charges: CheckoutDateCharge[];
  total: number;
  savingsTotal: number;
  chargePerDate: number;
};

export type DeliveryChargeSubscriptionInput = {
  planId: string;
  planName?: string;
};

function dateAfterWeeks(date: string, weeks: number) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  parsed.setDate(parsed.getDate() + weeks * 7);
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Build all actual subscription delivery dates for a selected term.
 * Seedlings subscriptions deliver weekly on Saturdays.
 */
export function buildSubscriptionDeliveryDates(startDate: string, deliveriesPerTerm: number) {
  const first = clean(startDate);
  const count = Math.max(1, Math.floor(Number(deliveriesPerTerm) || 1));
  return Array.from({ length: count }, (_, index) => dateAfterWeeks(first, index)).filter(Boolean);
}

/**
 * Phase 6 checkout delivery charge.
 *
 * One pincode delivery charge is applied once per unique actual delivery date
 * across the complete checkout. Subscription plan delivery-charge overrides and
 * the old Delivery Charges Master are intentionally not used here.
 */
export async function calculateUniqueDateCheckoutDeliveryCharges(input: {
  pincode: string;
  oneTimeDates?: string[];
  subscriptionDates?: string[];
}): Promise<UniqueDateCheckoutDeliveryCharges> {
  const pincode = clean(input.pincode).replace(/\D/g, '').slice(0, 6);
  if (!/^\d{6}$/.test(pincode)) {
    throw new Error('A valid 6-digit pincode is required to calculate delivery charges.');
  }

  const dates = [...new Set([
    ...(input.oneTimeDates ?? []),
    ...(input.subscriptionDates ?? []),
  ].map(clean).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort();

  if (!dates.length) {
    return { dates: [], charges: [], total: 0, savingsTotal: 0, chargePerDate: 0 };
  }

  const geoSnap = await getDocs(collection(db, 'geolocations'));
  const matches = geoSnap.docs.filter((doc) => {
    const data = doc.data() || {};
    return data.active === true && clean(data.pincode).replace(/\D/g, '') === pincode;
  });
  if (matches.length > 1) {
    throw new Error(`Multiple active geolocations are configured for pincode ${pincode}.`);
  }
  if (matches.length === 0) {
    throw new Error(`Pincode ${pincode} is not currently serviceable. Please contact us for assistance.`);
  }

  const geoDoc = matches[0];
  const geo = geoDoc?.data() || {};
  const charge = nonNegative(geo.deliveryCharge);
  const source: DeliveryChargeResult['source'] = geoDoc ? 'geolocation' : 'none';
  const sourceId = geoDoc?.id ?? '';
  const sourceName = geoDoc ? clean(geo.locationName) || `Pincode ${pincode}` : '';

  const charges = dates.map((deliveryDate) => ({
    deliveryDate,
    charge,
    source,
    sourceId,
    sourceName,
  }));

  return {
    dates,
    charges,
    total: charge * dates.length,
    savingsTotal: 0,
    chargePerDate: charge,
  };
}

/**
 * Legacy helper retained for the existing order-writing code until Phase 7.
 * New Checkout code must use calculateUniqueDateCheckoutDeliveryCharges().
 */
export async function calculateCheckoutDeliveryCharges(input: {
  pincode: string;
  oneTime: boolean;
  subscriptions: DeliveryChargeSubscriptionInput[];
}): Promise<CheckoutDeliveryCharges> {
  const pincode = clean(input.pincode).replace(/\D/g, '').slice(0, 6);
  if (!/^\d{6}$/.test(pincode)) throw new Error('A valid 6-digit pincode is required to calculate delivery charges.');

  const [geoSnap, masterSnap, planSnap] = await Promise.all([
    getDocs(collection(db, 'geolocations')),
    getDocs(collection(db, 'deliveryCharges')),
    getDocs(collection(db, 'subscriptionPlans')),
  ]);

  const geolocations = geoSnap.docs.filter((d) => {
    const x = d.data() || {};
    return x.active === true && clean(x.pincode).replace(/\D/g, '') === pincode;
  });
  if (geolocations.length > 1) throw new Error(`Multiple active geolocations are configured for pincode ${pincode}.`);
  const geoDoc = geolocations[0];
  const geo = geoDoc?.data() || null;

  const masters = masterSnap.docs.filter((d) => (d.data() || {}).active === true);
  const masterFor = (scope: 'one_time_order' | 'subscription') => {
    const matches = masters.filter((d) => String(d.data()?.scope || '') === scope);
    if (matches.length > 1) throw new Error(`Multiple active ${scope === 'one_time_order' ? 'one-time' : 'subscription'} delivery charges are configured.`);
    return matches[0];
  };

  const noneResult = (): DeliveryChargeResult => ({
    finalCharge: 0, baseCharge: 0, savings: 0, isFree: true,
    source: 'none', sourceId: '', sourceName: '', snapshot: {},
  });

  const baseResult = (kind: 'one_time_order' | 'subscription'): DeliveryChargeResult => {
    const geoField = kind === 'one_time_order' ? 'oneTimeCharge' : 'subscriptionCharge';
    if (geoDoc && geo) {
      const charge = nonNegative(geo[geoField]);
      return {
        finalCharge: charge,
        baseCharge: charge,
        savings: 0,
        isFree: charge === 0,
        source: 'geolocation',
        sourceId: geoDoc.id,
        sourceName: clean(geo.locationName) || `Pincode ${pincode}`,
        snapshot: { id: geoDoc.id, locationName: clean(geo.locationName), pincode, [geoField]: charge, active: true },
      };
    }
    const masterDoc = masterFor(kind);
    const master = masterDoc?.data() || null;
    if (masterDoc && master) {
      const charge = clean(master.mode).toLowerCase() === 'free' ? 0 : nonNegative(master.amount);
      return { finalCharge: charge, baseCharge: charge, savings: 0, isFree: charge === 0, source: 'delivery_master', sourceId: masterDoc.id, sourceName: clean(master.name) || 'Delivery Charges Master', snapshot: { id: masterDoc.id, name: clean(master.name), scope: clean(master.scope), mode: clean(master.mode), amount: charge, active: true } };
    }
    return noneResult();
  };

  const oneTime = input.oneTime ? baseResult('one_time_order') : noneResult();
  const subscriptions = input.subscriptions.map((entry) => {
    const base = baseResult('subscription');
    const planDoc = planSnap.docs.find((d) => d.id === entry.planId);
    if (!planDoc) throw new Error(`Subscription plan "${entry.planName || entry.planId}" was not found.`);
    const plan = planDoc.data() || {};
    if (plan.active !== true) throw new Error(`Subscription plan "${entry.planName || plan.name || entry.planId}" is no longer active.`);
    return { ...base, planId: entry.planId, planName: clean(plan.name) || entry.planName || entry.planId };
  });

  const subscriptionTotal = subscriptions.reduce((sum, item) => sum + item.finalCharge, 0);
  return { oneTime, subscriptions, oneTimeTotal: oneTime.finalCharge, subscriptionTotal, total: oneTime.finalCharge + subscriptionTotal, savingsTotal: 0 };
}

/** Compatibility helper for existing one-time order creation. */
export async function getActiveOneTimeDeliveryCharge(pincode?: string) {
  if (!pincode) return null;
  const result = await calculateCheckoutDeliveryCharges({ pincode, oneTime: true, subscriptions: [] });
  if (result.oneTime.source === 'none') return null;
  return { id: result.oneTime.sourceId, name: result.oneTime.sourceName, mode: result.oneTime.finalCharge === 0 ? 'free' : 'fixed', amount: result.oneTime.finalCharge, details: result.oneTime.snapshot };
}
