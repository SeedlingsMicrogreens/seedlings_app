import { collection, getDocs } from '../core/firestore';
import { db } from '../core/firebaseClient';

export type CustomerOffer = {
  id: string;
  name: string;
  locationType?: 'all' | 'pincode' | string;
  pincodeIds?: string[];
  pincodeLabels?: string[];
  type: 'price' | 'deliveryCharge' | 'quantity' | string;
  startDate?: string;
  endDate?: string;
  active?: boolean;
  discountType?: 'percentage' | 'flat' | string;
  discountValue?: number;
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

const clean = (value: unknown) => String(value ?? '').trim();
const amount = (value: unknown) => Math.max(0, Number(value) || 0);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function locationMatches(offer: CustomerOffer, geoId: string, pincode: string, locationName: string) {
  if (offer.locationType === 'all' || !offer.locationType) return true;
  if (offer.locationType !== 'pincode') return false;
  return (offer.pincodeIds ?? []).map(clean).includes(geoId)
    || (offer.pincodeLabels ?? []).map((value) => clean(value).toLowerCase()).includes(locationName.toLowerCase())
    || (offer.pincodeLabels ?? []).map(clean).includes(pincode);
}

function savingFor(offer: CustomerOffer, base: number) {
  if (base <= 0) return 0;
  const value = amount(offer.discountValue);
  return offer.discountType === 'percentage' ? Math.min(base, base * Math.min(100, value) / 100) : Math.min(base, value);
}

export async function calculateCustomerOffers(input: {
  pincode: string;
  oneTimeSubtotal: number;
  subscriptionSubtotal?: number;
  oneTimeDelivery: number;
}): Promise<CheckoutOfferResult> {
  const pincode = clean(input.pincode);
  if (!pincode) return { priceSavings: 0, oneTimePriceSavings: 0, subscriptionPriceSavings: 0, deliverySavings: 0, totalSavings: 0 };
  const [offerSnap, geoSnap] = await Promise.all([getDocs(collection(db, 'offers')), getDocs(collection(db, 'geolocations'))]);
  const geo = geoSnap.docs.find((doc) => {
    const data = doc.data() || {};
    return data.active !== false && clean(data.pincode) === pincode;
  });
  const geoData = geo?.data() || {};
  const geoId = geo?.id || '';
  const locationName = clean(geoData.locationName);
  const date = today();
  const offers = offerSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Omit<CustomerOffer, 'id'>) }));
  const matching = offers.filter((offer) => offer.active !== false
    && (!offer.startDate || offer.startDate <= date)
    && (!offer.endDate || offer.endDate >= date)
    && locationMatches(offer, geoId, pincode, locationName));
  const best = (candidates: CustomerOffer[], base: number) => candidates
    .map((offer) => ({ offer, saving: savingFor(offer, base) }))
    .sort((a, b) => b.saving - a.saving)[0];
  const oneTimeSubtotal = amount(input.oneTimeSubtotal);
  const subscriptionSubtotal = amount(input.subscriptionSubtotal);
  const combined = oneTimeSubtotal + subscriptionSubtotal;
  const price = best(matching.filter((offer) => offer.type === 'price'), combined);
  const delivery = best(matching.filter((offer) => offer.type === 'deliveryCharge'), amount(input.oneTimeDelivery));
  let oneTimePriceSavings = 0;
  let subscriptionPriceSavings = 0;
  if (price?.offer && combined > 0) {
    if (price.offer.discountType === 'percentage') {
      oneTimePriceSavings = savingFor(price.offer, oneTimeSubtotal);
      subscriptionPriceSavings = savingFor(price.offer, subscriptionSubtotal);
    } else {
      const total = Math.min(combined, amount(price.offer.discountValue));
      oneTimePriceSavings = Math.min(oneTimeSubtotal, Math.round((total * oneTimeSubtotal / combined) * 100) / 100);
      subscriptionPriceSavings = Math.min(subscriptionSubtotal, Math.round((total - oneTimePriceSavings) * 100) / 100);
    }
  }
  const priceSavings = Math.min(combined, oneTimePriceSavings + subscriptionPriceSavings);
  const deliverySavings = delivery?.saving || 0;
  return { priceSavings, oneTimePriceSavings, subscriptionPriceSavings, deliverySavings, totalSavings: priceSavings + deliverySavings, priceOffer: price?.offer, deliveryOffer: delivery?.offer };
}
