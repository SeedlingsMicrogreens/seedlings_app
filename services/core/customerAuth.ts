export type CustomerAuthUser = {
  uid: string;
  phoneNumber?: string | null;
};

export async function getCustomerIdToken(forceRefresh = false): Promise<string> {
  const { auth } = await import('./firebaseClient');
  const user = auth.currentUser;
  if (!user) throw new Error('Customer session not found. Please log in again.');

  // JS SDK and React Native Firebase expose the same logical operation but
  // with different call signatures.
  if (typeof (user as any).getIdToken === 'function') {
    return (user as any).getIdToken(forceRefresh);
  }
  throw new Error('Firebase authentication token is unavailable.');
}
