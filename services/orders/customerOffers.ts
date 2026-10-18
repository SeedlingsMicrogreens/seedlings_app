import { collection, getDocs } from '../core/firestore';
import { db } from '../core/firebaseClient';
import {
  computeCustomerOffers as computeSharedCustomerOffers,
  computeSubscriptionDeliveryEntitlement,
  indiaDateToday,
  roundCheckoutMoney,
  NO_OFFERS,
  type CheckoutOfferResult,
  type CustomerOffer,
  type SubscriptionDeliveryEntitlement,
  type SubscriptionDeliveryEntitlementInput,
} from './checkoutPricing';

// Offer rules come from checkoutPricing.ts, an unchanged copy of the Website's
// lib/checkoutPricing.ts that the Website checkout and the server payment
// verification both use. Never re-implement a rule here: any difference makes
// the Website refuse the payment ("Order total could not be verified").
export { indiaDateToday, roundCheckoutMoney, NO_OFFERS };
export type { CheckoutOfferResult, CustomerOffer, SubscriptionDeliveryEntitlement, SubscriptionDeliveryEntitlementInput };

export type CustomerOfferPricingInput = {
  pincode: string;
  geoId: string;
  locationName?: string;
  /** One entry per one-time cart line, in cart order (unit price and quantity). */
  oneTimeItems: Array<{ price: number; quantity: number }>;
  /** One entry per subscription cart line, in cart order (plan price and quantity). */
  subscriptionItems: Array<{ price: number; quantity: number }>;
  /** One entry per charged delivery date. */
  deliveryChargeAmounts: number[];
  subscriptions?: SubscriptionDeliveryEntitlementInput[];
};

export function computeCustomerOffers(offers: CustomerOffer[], input: CustomerOfferPricingInput, today: string): CheckoutOfferResult {
  return computeSharedCustomerOffers(offers, input, today);
}

export function computeSubscriptionDeliveryEntitlements(
  offers: CustomerOffer[],
  inputs: SubscriptionDeliveryEntitlementInput[],
  today: string,
): SubscriptionDeliveryEntitlement[] {
  return inputs.map((input) => computeSubscriptionDeliveryEntitlement(offers, input, today));
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

const amount = (value: unknown) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0;
};

export function calculateCheckoutPayableTotal(
  productSubtotal: number,
  deliveryTotal: number,
  offers: Pick<CheckoutOfferResult, 'priceSavings' | 'deliverySavings'>,
) {
  return roundCheckoutMoney(calculateCheckoutPayableProductSubtotal(productSubtotal, offers.priceSavings)
    + calculateCheckoutPayableDeliveryCharge(deliveryTotal, offers.deliverySavings));
}

export function calculateCheckoutPayableProductSubtotal(productSubtotal: number, appliedPriceSavings: number) {
  return roundCheckoutMoney(Math.max(0, amount(productSubtotal) - amount(appliedPriceSavings)));
}

export function calculateCheckoutPayableDeliveryCharge(deliveryTotal: number, appliedDeliverySavings: number) {
  return roundCheckoutMoney(Math.max(0, amount(deliveryTotal) - amount(appliedDeliverySavings)));
}
