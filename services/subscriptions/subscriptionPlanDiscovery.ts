export type SubscriptionPlanLoadState = 'idle' | 'loading' | 'ready' | 'error';

export type ProductSubscriptionPlan = {
  active?: unknown;
  price?: unknown;
  salableProductId?: unknown;
};

export function filterActivePlansForProduct<T extends ProductSubscriptionPlan>(
  plans: T[],
  productId: string,
): T[] {
  const expectedProductId = productId.trim();
  if (!expectedProductId) return [];

  return plans.filter((plan) =>
    plan.active === true
    && plan.price !== undefined
    && plan.price !== null
    && Number.isFinite(Number(plan.price))
    && Number(plan.price) >= 0
    && String(plan.salableProductId ?? '').trim() === expectedProductId);
}

export function productSubscriptionSectionState(input: {
  loadState: SubscriptionPlanLoadState;
  planCount: number;
}): 'loading' | 'error' | 'empty' | 'ready' {
  if (input.loadState === 'error') return 'error';
  if (input.loadState === 'ready') return input.planCount > 0 ? 'ready' : 'empty';
  return 'loading';
}
