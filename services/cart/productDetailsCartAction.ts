export type AddToCartLock = { current: boolean };

export const PRODUCT_DETAILS_CART_ROUTE = '/(customer)/(tabs)/cart' as const;

export async function addToCartAndNavigate(
  lock: AddToCartLock,
  add: () => void,
  navigateToCart: () => void,
): Promise<boolean> {
  if (lock.current) return false;
  lock.current = true;

  try {
    add();
  } catch (error) {
    lock.current = false;
    throw error;
  }

  navigateToCart();
  return true;
}
