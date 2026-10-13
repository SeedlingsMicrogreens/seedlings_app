export type SellingOptionCandidate = {
  id: string;
  weightGrams: number;
  price: number;
  active: boolean;
};

export type ProductWithSellingOptions<T extends SellingOptionCandidate> = {
  sellingOptions?: T[];
};

export function getAvailableOneTimeSellingOptions<T extends SellingOptionCandidate>(
  product: ProductWithSellingOptions<T>,
): T[] {
  return (product.sellingOptions ?? []).filter((option) =>
    option.active !== false
    && Number.isFinite(option.weightGrams)
    && option.weightGrams > 0
    && Number.isFinite(option.price)
    && option.price >= 0);
}

export function getDefaultOneTimeSellingOptionFromOptions<T extends SellingOptionCandidate>(
  options: T[],
): T | undefined {
  return getAvailableOneTimeSellingOptions({ sellingOptions: options })
    .sort((a, b) => a.weightGrams - b.weightGrams)[0];
}
