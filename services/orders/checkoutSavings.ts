export type CheckoutSavingsBreakdown = {
  mrpSavings: number;
  priceOfferSavings: number;
  productSavings: number;
  subscriptionPlanSavings: number;
  deliverySavings: number;
  totalSavings: number;
};

export function formatCheckoutAmount(value: number, currency = 'INR') {
  const amount = Number.isFinite(value) ? value : 0;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `₹${amount.toFixed(2)}`;
  }
}

export function checkoutSavingsBreakdown(input: {
  mrpSavings: number;
  priceOfferSavings: number;
  subscriptionPlanSavings?: number;
  deliverySavings: number;
}): CheckoutSavingsBreakdown {
  const round = (value: number) => Math.round((Number.isFinite(value) ? Math.max(0, value) : 0) * 100) / 100;
  const mrpSavings = round(input.mrpSavings);
  const priceOfferSavings = round(input.priceOfferSavings);
  const productSavings = round(mrpSavings + priceOfferSavings);
  const subscriptionPlanSavings = round(input.subscriptionPlanSavings || 0);
  const deliverySavings = round(input.deliverySavings);
  return {
    mrpSavings,
    priceOfferSavings,
    productSavings,
    subscriptionPlanSavings,
    deliverySavings,
    totalSavings: round(productSavings + subscriptionPlanSavings + deliverySavings),
  };
}
