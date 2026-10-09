import { getApp } from '@react-native-firebase/app';
import { getAuth } from '@react-native-firebase/auth';
import { getFirestore } from '@react-native-firebase/firestore';

// Native Android/iOS uses the Firebase app registered in the native build
// (google-services.json / GoogleService-Info.plist). It is intentionally not
// initialized through the Website or a Website API.
export const app = getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = undefined;
