import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BackHandler, Platform } from 'react-native';
import { router, usePathname } from 'expo-router';

const HOME_PATHS = new Set([
  '/',
  '/(customer)/(tabs)',
  '/(customer)/(tabs)/',
  '/(customer)/(tabs)/index',
]);

const EXIT_CONFIRMATION_MS = 2200;

type BackNavigationContextValue = {
  handleBack: () => boolean;
  toastMessage: string | null;
};

const BackNavigationContext = createContext<BackNavigationContextValue | null>(null);

function isHomePath(pathname: string) {
  return HOME_PATHS.has(pathname);
}

export function BackNavigationProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const lastExitBackAt = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showExitToast = useCallback(() => {
    setToastMessage('Press back again to exit');
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMessage(null), EXIT_CONFIRMATION_MS);
  }, []);

  const exitOrWarn = useCallback(() => {
    const now = Date.now();
    if (now - lastExitBackAt.current <= EXIT_CONFIRMATION_MS) {
      lastExitBackAt.current = 0;
      if (toastTimer.current) clearTimeout(toastTimer.current);
      setToastMessage(null);
      if (Platform.OS === 'android') BackHandler.exitApp();
      return true;
    }

    lastExitBackAt.current = now;
    showExitToast();
    return true;
  }, [showExitToast]);

  const handleBack = useCallback(() => {
    // The customer Home screen is the application root. Require a second
    // back press within the confirmation window before exiting on Android.
    if (isHomePath(pathname)) return exitOrWarn();

    // Never call router.back() without navigation history. This prevents the
    // Expo Router "GO_BACK was not handled by any navigator" warning.
    if (router.canGoBack()) {
      router.back();
      return true;
    }

    // A screen opened without history is effectively a root screen. Use the
    // same safe double-back exit behavior instead of issuing an unhandled back.
    return exitOrWarn();
  }, [exitOrWarn, pathname]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => subscription.remove();
  }, [handleBack]);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const value = useMemo(() => ({ handleBack, toastMessage }), [handleBack, toastMessage]);

  return <BackNavigationContext.Provider value={value}>{children}</BackNavigationContext.Provider>;
}

export function useBackNavigation() {
  const context = useContext(BackNavigationContext);
  if (!context) throw new Error('useBackNavigation must be used inside BackNavigationProvider');
  return context;
}
