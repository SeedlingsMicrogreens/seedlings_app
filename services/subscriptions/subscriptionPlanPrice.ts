export type SubscriptionPlanSellingOption = {
  id?: string;
  sellingOptionId?: string;
  sellingOptionLabel?: string;
  weightGrams?: number;
  planPrice?: number;
  maximumPlanPrice?: number;
};

export type SubscriptionPlanLike = {
  price: number;
  sellingOptions?: SubscriptionPlanSellingOption[];
};

export function getSubscriptionPlanSellingOption(
  plan: SubscriptionPlanLike,
  sellingOptionId?: string,
  sellingOptionWeightGrams?: number,
): SubscriptionPlanSellingOption | undefined {
  const options = (plan.sellingOptions ?? []).filter((item) =>
    Number.isFinite(Number(item.weightGrams))
    && Number(item.weightGrams) > 0
    && Number.isFinite(Number(item.planPrice))
    && Number(item.planPrice) >= 0);
  const packagingMatch = sellingOptionWeightGrams !== undefined
    ? options.find((item) => Number(item.weightGrams) === sellingOptionWeightGrams)
    : undefined;
  const sellingOptionMatch = sellingOptionId?.trim()
    ? options.find((item) => String(item.sellingOptionId ?? item.id ?? '').trim() === sellingOptionId.trim())
    : undefined;
  return packagingMatch ?? sellingOptionMatch;
}

export function getSubscriptionPlanPriceForSellingOption(
  plan: SubscriptionPlanLike,
  sellingOptionId?: string,
  sellingOptionWeightGrams?: number,
): number | undefined {
  const option = getSubscriptionPlanSellingOption(plan, sellingOptionId, sellingOptionWeightGrams);
  if (option) return Number(option.planPrice);
  if (!sellingOptionId?.trim() && sellingOptionWeightGrams === undefined) {
    const basePrice = Number(plan.price);
    return Number.isFinite(basePrice) && basePrice >= 0 ? basePrice : undefined;
  }
  return undefined;
}
