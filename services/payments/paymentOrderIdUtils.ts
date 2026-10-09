export function normalizePaymentOrderIds(orderIds: Iterable<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of orderIds) {
    const candidate = String(value ?? '').trim();
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    normalized.push(candidate);
  }

  return normalized;
}
