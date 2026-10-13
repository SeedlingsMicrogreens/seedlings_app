export async function saveEnquiriesBeforeRemovingItems<T>(
  items: readonly T[],
  saveEnquiry: (item: T) => Promise<void>,
  removeItem: (item: T) => void,
) {
  for (const item of items) {
    await saveEnquiry(item);
    removeItem(item);
  }
}
