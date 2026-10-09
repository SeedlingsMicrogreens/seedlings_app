import { getMessaging, getToken, onMessage, onNotificationOpenedApp, onTokenRefresh, requestPermission, AuthorizationStatus, getInitialNotification } from '@react-native-firebase/messaging';
import { PermissionsAndroid, Platform } from 'react-native';
import { router } from 'expo-router';
import { getCustomerNotificationById, registerCustomerPushToken } from './notificationService';
import { auth, db } from '../core/firebaseClient';
import { collection, getDocs, query, updateDoc, where, doc, serverTimestamp } from '../core/firestore';

export type ForegroundNotification = { title: string; message: string };

export async function disableCustomerPushNotifications(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const messaging = getMessaging();
  const uid = auth.currentUser?.uid;
  if (uid) {
    try {
      const snapshot = await getDocs(query(collection(db, 'customerPushSubscriptions'), where('authUid', '==', uid)));
      await Promise.all(snapshot.docs.map((item: any) => updateDoc(doc(db, 'customerPushSubscriptions', item.id), { active: false, updatedAt: serverTimestamp() })));
    } catch {}
  }
  try { await messaging.deleteToken(); } catch {}
}


let stop: (() => void) | null = null;
let tokenStop: (() => void) | null = null;

export async function initializeCustomerPushNotifications(
  mobile: string,
  onForegroundNotification?: (notification: ForegroundNotification) => void,
): Promise<() => void> {
  if (Platform.OS !== 'android') return () => {};
  stop?.();
  tokenStop?.();
  stop = null;
  tokenStop = null;

  const messaging = getMessaging();
  if (Platform.Version >= 33) {
    const permission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    if (permission !== PermissionsAndroid.RESULTS.GRANTED) return () => {};
  }
  const authorization = await requestPermission(messaging);
  const allowed = authorization === AuthorizationStatus.AUTHORIZED || authorization === AuthorizationStatus.PROVISIONAL;
  if (!allowed) return () => {};

  const token = await getToken(messaging);
  if (token) await registerCustomerPushToken(mobile, token);

  tokenStop = onTokenRefresh(messaging, async (nextToken) => {
    await registerCustomerPushToken(mobile, nextToken);
  });

  stop = onMessage(messaging, async (remoteMessage) => {
    const title = remoteMessage.notification?.title || String(remoteMessage.data?.title || 'Seedlings Microgreens');
    const message = remoteMessage.notification?.body || String(remoteMessage.data?.body || 'You have a new notification.');
    onForegroundNotification?.({ title, message });
  });

  const openedHandler = onNotificationOpenedApp(messaging, async (remoteMessage) => {
    await openNotificationFromMessage(remoteMessage.data?.notificationId);
  });
  const initial = await getInitialNotification(messaging);
  if (initial) await openNotificationFromMessage(initial.data?.notificationId);

  const cleanup = () => {
    stop?.();
    tokenStop?.();
    openedHandler();
    stop = null;
    tokenStop = null;
  };
  return cleanup;
}

async function openNotificationFromMessage(notificationId: unknown) {
  if (typeof notificationId !== 'string' || !notificationId) {
    router.push('/(customer)/account/notifications' as any);
    return;
  }
  try {
    const item = await getCustomerNotificationById(notificationId);
    if (item?.orderId) router.push(`/(customer)/order/${item.orderId}` as any);
    else if (item?.subscriptionId) router.push('/(customer)/account/subscriptions' as any);
    else router.push('/(customer)/account/notifications' as any);
  } catch {
    router.push('/(customer)/account/notifications' as any);
  }
}
