import { collection, getDocs } from '../core/firestore';
import { db } from '../core/firebaseClient';

export type CustomerOffer = {
  id: string;
  name?: unknown;
  locationType?: unknown;
  pincodeIds?: unknown;
  pincodeLabels?: unknown;
  type?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  active?: unknown;
  status?: unknown;
  discountType?: unknown;
  discountValue?: unknown;
  subscriptionOffer?: unknown;
};

export type CheckoutOfferResult = {
  priceSavings: number;
  oneTimePriceSavings: number;
  subscriptionPriceSavings: number;
  deliverySavings: number;
  totalSavings: number;
  priceOffer?: CustomerOffer;
  deliveryOffer?: CustomerOffer;
};

export type SubscriptionDeliveryEntitlement = {
  regularDeliveries: number;
  bonusDeliveries: number;
  totalDeliveries: number;
  offer?: CustomerOffer;
};

export type SubscriptionDeliveryEntitlementInput = {
  frequency: string;
  regularDeliveries: number;
  pincode: string;
  geoId: string;
  locationName?: string;
};

export type CustomerOfferPricingInput = {
  pincode: string;
  geoId: string;
  locationName?: string;
  oneTimeSubtotal: number;
  subscriptionSubtotal?: number;
  deliveryChargeAmounts: number[];
  subscriptions?: SubscriptionDeliveryEntitlementInput[];
};

const NO_OFFERS: CheckoutOfferResult = {
  priceSavings: 0,
  oneTimePriceSavings: 0,
  subscriptionPriceSavings: 0,
  deliverySavings: 0,
  totalSavings: 0,
};

const text = (value: unknown) => String(value ?? '').trim();
const normalized = (value: unknown) => text(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const amount = (value: unknown) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0;
};
const normalizePincode = (value: unknown) => text(value).replace(/\D/g, '');

function indiaDate(value: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

export function indiaDateToday() {
  return indiaDate(new Date());
}

function offerDate(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : indiaDate(value);
  if (typeof value === 'string') {
    const date = value.trim();
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (dateOnly) {
      const parsed = new Date(`${date}T00:00:00Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
    }
    if (/^\d{4}-\d{2}-\d{2}T/.test(date) && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(date)) {
      return Number.isNaN(new Date(date).getTime()) ? null : offerDate(date.slice(0, 10));
    }
    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? null : indiaDate(parsed);
  }
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof value.toDate === 'function') {
    try {
      const parsed = value.toDate();
      return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? indiaDate(parsed) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function locationMatches(offer: CustomerOffer, geoId: string, pincode: string, locationName: string) {
  const scope = normalized(offer.locationType);
  if (scope === 'all' || scope === 'allpincodes' || !scope) return true;
  if (scope !== 'pincode' && scope !== 'specificpincode') return false;
  const ids = Array.isArray(offer.pincodeIds) ? offer.pincodeIds.map(text) : [];
  const labels = Array.isArray(offer.pincodeLabels) ? offer.pincodeLabels.map(text) : [];
  return ids.includes(geoId)
    || (!!locationName && labels.some((label) => label.toLowerCase() === locationName.toLowerCase()))
    || labels.some((label) => normalizePincode(label) === pincode);
}

function activeOffers(offers: CustomerOffer[], geoId: string, pincode: string, locationName: string, date: string) {
  return offers.filter((offer) => {
    const status = normalized(offer.status);
    const needsExplicitActiveState = normalized(offer.type) === 'deliverycharge';
    const activeValue = offer.active === undefined || offer.active === null
      ? status === 'active' || !needsExplicitActiveState
      : offer.active === true || normalized(offer.active) === 'true' || normalized(offer.active) === 'active';
    const explicitlyInactive = ['archived', 'disabled', 'draft', 'expired', 'inactive', 'paused'].includes(status);
    if (!activeValue || explicitlyInactive) return false;

    const startDate = offerDate(offer.startDate);
    const endDate = offerDate(offer.endDate);
    if ((offer.startDate !== undefined && offer.startDate !== null && offer.startDate !== '' && !startDate)
      || (offer.endDate !== undefined && offer.endDate !== null && offer.endDate !== '' && !endDate)) return false;
    return (!startDate || startDate <= date)
      && (!endDate || endDate >= date)
      && locationMatches(offer, geoId, pincode, locationName);
  });
}

function discountType(offer: CustomerOffer): 'percentage' | 'flat' | null {
  const kind = normalized(offer.discountType);
  return kind === 'percentage' ? 'percentage' : kind === 'flat' ? 'flat' : null;
}

function hasValidDiscount(offer: CustomerOffer) {
  const value = Number(offer.discountValue);
  return discountType(offer) !== null && Number.isFinite(value) && value >= 0;
}

function savingFor(offer: CustomerOffer, base: number) {
  if (base <= 0 || !hasValidDiscount(offer)) return 0;
  const value = Number(offer.discountValue);
  if (discountType(offer) === 'percentage') return Math.min(base, base * Math.min(100, value) / 100);
  return Math.min(base, value);
}

function bestOffer(offers: CustomerOffer[], saving: (offer: CustomerOffer) => number) {
  return offers
    .map((offer) => ({ offer, saving: saving(offer) }))
    .sort((left, right) => right.saving - left.saving)[0];
}

export function computeCustomerOffers(offers: CustomerOffer[], input: CustomerOfferPricingInput, today: string): CheckoutOfferResult {
  const matching = activeOffers(
    offers,
    text(input.geoId),
    normalizePincode(input.pincode),
    text(input.locationName),
    today,
  );
  const priceCandidates = matching.filter((offer) => normalized(offer.type) === 'price' && hasValidDiscount(offer));
  const deliveryCandidates = matching.filter((offer) => normalized(offer.type) === 'deliverycharge' && hasValidDiscount(offer));
  const oneTimeSubtotal = amount(input.oneTimeSubtotal);
  const subscriptionSubtotal = amount(input.subscriptionSubtotal);
  const combinedProductSubtotal = oneTimeSubtotal + subscriptionSubtotal;
  const price = bestOffer(priceCandidates, (offer) => savingFor(offer, combinedProductSubtotal));
  const eligibleDeliveryTotal = input.deliveryChargeAmounts.reduce((sum, charge) => sum + amount(charge), 0);
  const delivery = eligibleDeliveryTotal > 0
    ? bestOffer(deliveryCandidates, (offer) => savingFor(offer, eligibleDeliveryTotal))
    : undefined;

  let oneTimePriceSavings = 0;
  let subscriptionPriceSavings = 0;
  if (price?.offer && combinedProductSubtotal > 0) {
    if (discountType(price.offer) === 'percentage') {
      oneTimePriceSavings = savingFor(price.offer, oneTimeSubtotal);
      subscriptionPriceSavings = savingFor(price.offer, subscriptionSubtotal);
    } else {
      const totalPriceSaving = Math.min(combinedProductSubtotal, amount(price.offer.discountValue));
      oneTimePriceSavings = Math.min(
        oneTimeSubtotal,
        Math.round((totalPriceSaving * oneTimeSubtotal / combinedProductSubtotal) * 100) / 100,
      );
      subscriptionPriceSavings = Math.min(
        subscriptionSubtotal,
        Math.round((totalPriceSaving - oneTimePriceSavings) * 100) / 100,
      );
    }
  }

  const priceSavings = Math.min(combinedProductSubtotal, oneTimePriceSavings + subscriptionPriceSavings);
  const deliverySavings = delivery?.saving || 0;
  return {
    priceSavings,
    oneTimePriceSavings,
    subscriptionPriceSavings,
    deliverySavings,
    totalSavings: priceSavings + deliverySavings,
    priceOffer: price?.offer,
    deliveryOffer: delivery?.offer,
  };
}

const subscriptionFrequencies = new Set(['monthly', 'quarterly', 'half_yearly', 'yearly']);

export function computeSubscriptionDeliveryEntitlements(
  offers: CustomerOffer[],
  inputs: SubscriptionDeliveryEntitlementInput[],
  today: string,
): SubscriptionDeliveryEntitlement[] {
  return inputs.map((input) => {
    const frequency = text(input.frequency).toLowerCase();
    const regularDeliveries = Number(input.regularDeliveries);
    if (!subscriptionFrequencies.has(frequency)) {
      throw new Error('Selected subscription plan has an unsupported frequency.');
    }
    if (!Number.isSafeInteger(regularDeliveries) || regularDeliveries < 1) {
      throw new Error('This subscription plan has an invalid deliveries-per-term value.');
    }

    const candidates = activeOffers(
      offers.filter((offer) => normalized(offer.type) === 'subscription'),
      text(input.geoId),
      normalizePincode(input.pincode),
      text(input.locationName),
      today,
    ).filter((offer) => {
      const configuration = offer.subscriptionOffer as Record<string, unknown> | undefined;
      return Array.isArray(configuration?.frequencies)
        && configuration.frequencies.some((value) => text(value).toLowerCase() === frequency);
    });

    if (candidates.length > 1) {
      throw new Error('More than one subscription offer is eligible. Please contact support before purchasing.');
    }
    const offer = candidates[0];
    if (!offer) return { regularDeliveries, bonusDeliveries: 0, totalDeliveries: regularDeliveries };

    const configuration = offer.subscriptionOffer as Record<string, unknown>;
    const extras = configuration.extraDeliveriesByFrequency;
    const bonusDeliveries = extras && typeof extras === 'object' && !Array.isArray(extras)
      ? Number((extras as Record<string, unknown>)[frequency])
      : Number.NaN;
    const totalDeliveries = regularDeliveries + bonusDeliveries;
    if (!Number.isSafeInteger(bonusDeliveries) || bonusDeliveries < 1 || !Number.isSafeInteger(totalDeliveries)) {
      throw new Error('The eligible subscription offer has an invalid bonus-delivery configuration.');
    }
    return { regularDeliveries, bonusDeliveries, totalDeliveries, offer };
  });
}

export async function calculateCustomerOffers(input: CustomerOfferPricingInput & { today?: string }) {
  const snapshot = await getDocs(collection(db, 'offers'));
  const offers = snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<CustomerOffer, 'id'>) }));
  const today = input.today ?? indiaDateToday();
  return {
    ...computeCustomerOffers(offers, input, today),
    subscriptionEntitlements: computeSubscriptionDeliveryEntitlements(offers, input.subscriptions ?? [], today),
  };
}

export function allocateOfferSavings(saving: number, bases: number[]) {
  const total = bases.reduce((sum, base) => sum + amount(base), 0);
  const totalSaving = Math.min(amount(saving), total);
  let allocated = 0;
  return bases.map((base, index) => {
    const baseAmount = amount(base);
    const itemSaving = totalSaving <= 0 || total <= 0
      ? 0
      : index === bases.length - 1
        ? Math.min(baseAmount, Math.max(0, Math.round((totalSaving - allocated) * 100) / 100))
        : Math.min(baseAmount, Math.round((totalSaving * (baseAmount / total)) * 100) / 100);
    allocated += itemSaving;
    return itemSaving;
  });
}

export function calculateCheckoutPayableTotal(
  productSubtotal: number,
  deliveryTotal: number,
  offers: CheckoutOfferResult,
) {
  return calculateCheckoutPayableProductSubtotal(productSubtotal, offers.priceSavings)
    + calculateCheckoutPayableDeliveryCharge(deliveryTotal, offers.deliverySavings);
}

export function calculateCheckoutPayableProductSubtotal(productSubtotal: number, appliedPriceSavings: number) {
  return Math.max(0, amount(productSubtotal) - amount(appliedPriceSavings));
}

export function calculateCheckoutPayableDeliveryCharge(deliveryTotal: number, appliedDeliverySavings: number) {
  return Math.max(0, amount(deliveryTotal) - amount(appliedDeliverySavings));
}
