export type SubscriptionEligibilityProduct = {
  active?: boolean;
  subscriptionPurchase?: boolean;
  type?: 'single' | 'multiple' | string;
  components?: Array<{
    productId?: string;
    quantityGrams?: number | string;
  }>;
};

export function isProductSubscriptionEligible(product: SubscriptionEligibilityProduct | null | undefined): boolean {
  if (!product || product.active !== true || product.subscriptionPurchase !== true) return false;
  if (product.type === 'multiple') return false;
  if (!Array.isArray(product.components) || product.components.length !== 1) return false;

  const component = product.components[0];
  return Boolean(component?.productId) && Number(component?.quantityGrams) > 0;
}
