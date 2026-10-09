export function parseWeightGrams(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, value);
  }

  if (typeof value === 'string') {
    const normalized = value.toLowerCase().trim().replace(/,/g, '');
    if (!normalized) return fallback;

    const match = normalized.match(/([\d]+(?:\.\d+)?)\s*(kg|g)?/);
    if (!match) {
      const digits = Number.parseFloat(normalized.replace(/[^\d.]/g, ''));
      return Number.isFinite(digits) ? Math.max(0, digits) : fallback;
    }

    const amount = Number.parseFloat(match[1]);
    const unit = match[2] ?? (normalized.includes('kg') ? 'kg' : normalized.includes('g') ? 'g' : '');
    if (unit === 'kg') return Math.round(amount * 1000);
    if (unit === 'g') return Math.round(amount);
    if (normalized.includes('kg')) return Math.round(amount * 1000);
    if (normalized.includes('g')) return Math.round(amount);
    return Math.round(amount);
  }

  return fallback;
}

export function calculateComboComponentGrams(
  components: Array<{ productId?: string; quantityGrams?: number | string }>,
  packageGrams?: number | string,
  quantity = 1,
): Record<string, number> {
  const normalized = components
    .map((component) => ({
      productId: String(component.productId ?? '').trim(),
      grams: Number(component.quantityGrams) || 0,
    }))
    .filter((component) => component.productId && component.grams > 0);

  if (!normalized.length) return {};

  const totalGrams = normalized.reduce((sum, component) => sum + component.grams, 0);
  const effectivePackageGrams = parseWeightGrams(packageGrams, totalGrams);
  const selectedQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  const requested: Record<string, number> = {};

  for (const component of normalized) {
    const shareGrams = totalGrams > 0 ? effectivePackageGrams * (component.grams / totalGrams) : component.grams;
    const grams = shareGrams * selectedQuantity;
    if (grams > 0) requested[component.productId] = (requested[component.productId] || 0) + grams;
  }

  return requested;
}

export function weightLabelFromGrams(grams: number): string {
  const value = Math.max(0, Number(grams) || 0);
  if (value >= 1000) {
    const kilograms = value / 1000;
    if (Number.isInteger(kilograms)) return `${kilograms}kg`;
    return `${kilograms.toFixed(1).replace(/\.0$/, '')}kg`;
  }
  return `${value}g`;
}
