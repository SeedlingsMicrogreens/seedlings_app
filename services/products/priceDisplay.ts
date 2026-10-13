export type PriceDisplay = {
  originalPrice?: number;
  savings?: number;
};

export function resolvePriceDisplay(sellingPrice: number, originalPrice: unknown): PriceDisplay {
  const validOriginalType = typeof originalPrice === 'number' || typeof originalPrice === 'string';
  const original = validOriginalType ? Number(originalPrice) : Number.NaN;
  const showOriginal = validOriginalType
    && originalPrice !== ''
    && Number.isFinite(sellingPrice)
    && Number.isFinite(original)
    && original > sellingPrice;

  return {
    originalPrice: showOriginal ? original : undefined,
    savings: showOriginal ? original - sellingPrice : undefined,
  };
}

export function scalePriceDisplay(display: PriceDisplay, quantity: number): PriceDisplay {
  const scale = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  if (display.originalPrice === undefined || display.savings === undefined || scale === 0) {
    return { originalPrice: undefined, savings: undefined };
  }

  return {
    originalPrice: display.originalPrice * scale,
    savings: display.savings * scale,
  };
}
