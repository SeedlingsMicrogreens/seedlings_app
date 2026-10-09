export type SubscriptionPlanSellingOption = {
  id?: string;
  sellingOptionId?: string;
  sellingOptionLabel?: string;
  weightGrams?: number;
  planPrice?: number;
};

export type SubscriptionPlanLike = {
  price: number;
  sellingOptions?: SubscriptionPlanSellingOption[];
};

export function getSubscriptionPlanPriceForSellingOption(plan: SubscriptionPlanLike, sellingOptionId?: string): number | undefined {
  const option = sellingOptionId ? plan.sellingOptions?.find((item) => String(item.sellingOptionId ?? item.id ?? '') === String(sellingOptionId)) : undefined;
  if (!option) return undefined;
  const price = Number(option.planPrice);
  return Number.isFinite(price) ? price : undefined;
}
