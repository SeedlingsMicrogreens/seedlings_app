export async function signOutCustomerAuth(): Promise<void> {
  const { signOutCustomerAuth: signOut } = await import('../core/firebaseClient');
  await signOut();
}

export const signOut = signOutCustomerAuth;
