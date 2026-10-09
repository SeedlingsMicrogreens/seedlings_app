import { doc, getDoc } from '../core/firestore';
import { signOut } from './firebaseAuth';
import { auth, db } from '../core/firebaseClient';
import { getDatabase } from '../../storage/sqlite';
import { normalizeIndianMobile } from '../clientOnboarding';

const SESSION_KEY = 'customer_mobile';


async function waitForFirebaseAuthReady(timeoutMs = 5000): Promise<void> {
  if (auth.currentUser) return;

  await new Promise<void>((resolve) => {
    let settled = false;
    let unsubscribe: (() => void) | undefined;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (unsubscribe) unsubscribe();
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);

    if (typeof (auth as any).onAuthStateChanged === 'function') {
      unsubscribe = (auth as any).onAuthStateChanged(() => finish());
    } else {
      finish();
    }
  });
}

export async function restoreCustomerSession(): Promise<string | null> {
  const database = getDatabase();
  const row = database.getFirstSync<{ value: string }>(
    'SELECT value FROM app_meta WHERE key = ?',
    SESSION_KEY,
  );
  if (!row?.value) return null;

  // Firebase may restore persisted credentials asynchronously after app startup.
  // Wait for that state before deciding that the customer session is invalid.
  await waitForFirebaseAuthReady();

  const mobile = normalizeIndianMobile(row.value);
  if (!mobile || !auth.currentUser) {
    clearCustomerSession();
    if (auth.currentUser) await signOut();
    return null;
  }

  try {
    const customerSnapshot = await getDoc(doc(db, 'customers', mobile));
    if (!customerSnapshot.exists()) {
      clearCustomerSession();
      await signOut();
      return null;
    }
    const customer = customerSnapshot.data();
    if (customer.status === 'blocked' || customer.onboardingStatus === 'blocked') {
      clearCustomerSession();
      await signOut();
      return null;
    }
    const currentUid = auth.currentUser.uid;
    const canonicalUid = String(customer.authUid || '').trim();
    const authUids = Array.isArray(customer.authUids)
      ? customer.authUids.map((value: unknown) => String(value).trim()).filter(Boolean)
      : [];
    if (canonicalUid !== currentUid && !authUids.includes(currentUid)) {
      clearCustomerSession();
      await signOut();
      return null;
    }
    return mobile;
  } catch (error) {
    console.warn('Customer session restore could not validate remote customer:', error);
    return mobile;
  }
}

export function persistCustomerSession(mobile: string): void {
  const normalizedMobile = normalizeIndianMobile(mobile);
  if (!normalizedMobile) throw new Error('Invalid customer mobile number.');
  getDatabase().runSync(
    'INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)',
    SESSION_KEY,
    normalizedMobile,
  );
}

export function clearCustomerSession(): void {
  getDatabase().runSync('DELETE FROM app_meta WHERE key = ?', SESSION_KEY);
}

export async function logoutCustomer(): Promise<void> {
  clearCustomerSession();
  await signOut();
}
