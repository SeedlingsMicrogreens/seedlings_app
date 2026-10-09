import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../constants/theme';
import { useAppStore } from '../store/appStore';
import { BackNavigationProvider, useBackNavigation } from '../components/backNavigation';
import { Toast } from '../components/UI';
import { useEffect, useState } from 'react';
import { reconcilePendingPayment } from '../services/payments/paymentReconciliation';
import { initializeCustomerPushNotifications } from '../services/notifications/pushNotificationService';

function BackNavigationFeedback() {
  const { toastMessage } = useBackNavigation();

  if (!toastMessage) return null;

  return <Toast message={toastMessage} position="bottom" tone="neutral" />;
}

export default function RootLayout() {
  const hydrateSession = useAppStore((state) => state.hydrateSession);
  const authenticated = useAppStore((state) => state.authenticated);
  const sessionHydrated = useAppStore((state) => state.sessionHydrated);
  const mobile = useAppStore((state) => state.mobile);
  const [foregroundToast, setToast] = useState('');

  useEffect(() => {
    void hydrateSession();
  }, [hydrateSession]);

  useEffect(() => {
    if (!authenticated || !sessionHydrated) return;
    void reconcilePendingPayment();
  }, [authenticated, sessionHydrated]);

  useEffect(() => {
    if (!authenticated || !sessionHydrated || !mobile) return;
    let active = true;
    let cleanup: (() => void) | undefined;
    void initializeCustomerPushNotifications(mobile, ({ title, message }) => {
      if (!active) return;
      // Foreground FCM messages are not displayed by Android automatically.
      // The shared root toast keeps the user informed while the notification
      // record remains the source of truth in the Notifications screen.
      const cleanTitle = String(title || '').trim();
      const cleanMessage = String(message || '').trim();
      // Do not render empty/placeholder notification banners over customer screens.
      if (!cleanTitle && !cleanMessage) return;
      const content = [cleanTitle, cleanMessage].filter(Boolean).join(': ');
      if (!content || content === ':') return;
      setToast(content);
    }).then((stop) => { cleanup = stop; }).catch(() => {});
    return () => { active = false; cleanup?.(); };
  }, [authenticated, sessionHydrated, mobile]);


  useEffect(() => {
    if (!foregroundToast) return;
    const timer = setTimeout(() => setToast(''), 4500);
    return () => clearTimeout(timer);
  }, [foregroundToast]);

  return (
    <BackNavigationProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown:false, contentStyle:{ backgroundColor:colors.paper } }} />
      <BackNavigationFeedback />
      {foregroundToast ? <Toast message={foregroundToast} position="top" /> : null}
    </BackNavigationProvider>
  );
}
