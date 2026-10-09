import { Platform } from 'react-native';

export async function signOutCustomerAuth(): Promise<void> {
  if (Platform.OS === 'web') {
    const { signOut } = await import('firebase/auth');
    const { auth } = await import('../core/firebaseClient');
    await signOut(auth);
    return;
  }
  const { auth } = await import('../core/firebaseClient');
  await auth.signOut();
}

export const signOut = signOutCustomerAuth;
