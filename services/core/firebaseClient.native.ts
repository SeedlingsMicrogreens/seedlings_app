import { getApp } from '@react-native-firebase/app';
import { getAuth, signInWithCustomToken, signOut } from '@react-native-firebase/auth';
import { getFirestore } from '@react-native-firebase/firestore';
import type { CustomerAuthUser } from './customerAuth';

// Native Android/iOS uses the Firebase app registered in the native build
// (google-services.json / GoogleService-Info.plist). It is intentionally not
// initialized through the Website or a Website API.
export const app = getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = undefined;

export async function signInWithCustomerCustomToken(customToken: string): Promise<CustomerAuthUser> {
  const credential = await signInWithCustomToken(auth, customToken);
  return {
    uid: credential.user.uid,
    phoneNumber: credential.user.phoneNumber ?? null,
  };
}

export async function signOutCustomerAuth(): Promise<void> {
  await signOut(auth);
}
