import AsyncStorage from '@react-native-async-storage/async-storage';
import { createCheckoutAttemptId } from '../orders/checkoutAttemptUtils';

const STORAGE_KEY = '@seedlings/payment-attempt-v2';

export type PendingPaymentAttempt = {
  paymentAttemptId: string;
  cashfreeOrderId?: string;
  orderIds: string[];
  primaryOrderId: string;
  primaryOrderNumber: string;
  total: number;
  createdAt: number;
  checkoutFingerprint?: string;
  authUid?: string;
};

let creatingAttempt: { checkoutFingerprint: string; authUid: string; promise: Promise<PendingPaymentAttempt> } | null = null;
let storageQueue: Promise<void> = Promise.resolve();

function serializeStorageWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = storageQueue.then(operation, operation);
  storageQueue = result.then(() => undefined, () => undefined);
  return result;
}

function currentCreatingAttempt() {
  return creatingAttempt;
}

export async function savePendingPaymentAttempt(attempt: PendingPaymentAttempt) {
  await serializeStorageWrite(async () => {
    const existing = await getPendingPaymentAttempt();
    if (existing && existing.paymentAttemptId !== attempt.paymentAttemptId) {
      throw new Error('Another payment attempt is still being recovered. Finish or verify it before starting a new payment.');
    }
    const createdAt = existing?.createdAt || attempt.createdAt || Date.now();
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...attempt, createdAt }));
  });
}

export async function getOrCreatePendingPaymentAttempt(checkoutFingerprint: string, authUid: string): Promise<PendingPaymentAttempt> {
  const existing = await getPendingPaymentAttempt();
  if (existing) {
    if (existing.authUid && existing.authUid !== authUid) {
      throw new Error('A payment attempt belongs to a different signed-in customer. Sign in with that account to recover it.');
    }
    if (!existing.orderIds.length && existing.checkoutFingerprint && existing.checkoutFingerprint !== checkoutFingerprint) {
      throw new Error('A previous checkout may still be recovering. Restore the same cart and delivery address before retrying.');
    }
    return { ...existing, authUid, checkoutFingerprint: existing.checkoutFingerprint || checkoutFingerprint };
  }
  const activeAttempt = currentCreatingAttempt();
  if (activeAttempt) {
    if (activeAttempt.checkoutFingerprint !== checkoutFingerprint || activeAttempt.authUid !== authUid) {
      throw new Error('Another checkout is already being prepared. Please wait and retry.');
    }
    return activeAttempt.promise;
  }

  const promise = (async () => {
    const raced = await getPendingPaymentAttempt();
    if (raced) {
      if (raced.authUid && raced.authUid !== authUid) {
        throw new Error('A payment attempt belongs to a different signed-in customer. Sign in with that account to recover it.');
      }
      if (!raced.orderIds.length && raced.checkoutFingerprint && raced.checkoutFingerprint !== checkoutFingerprint) {
        throw new Error('A previous checkout may still be recovering. Restore the same cart and delivery address before retrying.');
      }
      return { ...raced, authUid, checkoutFingerprint: raced.checkoutFingerprint || checkoutFingerprint };
    }

    const attempt: PendingPaymentAttempt = {
      paymentAttemptId: createCheckoutAttemptId(authUid, checkoutFingerprint),
      orderIds: [],
      primaryOrderId: '',
      primaryOrderNumber: '',
      total: 0,
      createdAt: Date.now(),
      checkoutFingerprint,
      authUid,
    };
    await savePendingPaymentAttempt(attempt);
    return attempt;
  })();
  creatingAttempt = { checkoutFingerprint, authUid, promise };

  try {
    return await promise;
  } finally {
    creatingAttempt = null;
  }
}

export async function getPendingPaymentAttempt(): Promise<PendingPaymentAttempt | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingPaymentAttempt;
    if (!parsed.paymentAttemptId || !Array.isArray(parsed.orderIds)) {
      throw new Error('Saved payment attempt is incomplete. Checkout is blocked to avoid creating duplicate orders.');
    }
    return {
      paymentAttemptId: String(parsed.paymentAttemptId),
      ...(parsed.cashfreeOrderId ? { cashfreeOrderId: String(parsed.cashfreeOrderId) } : {}),
      orderIds: parsed.orderIds.map(String).filter(Boolean),
      primaryOrderId: String(parsed.primaryOrderId ?? ''),
      primaryOrderNumber: String(parsed.primaryOrderNumber ?? ''),
      total: Number(parsed.total) || 0,
      createdAt: Number(parsed.createdAt) || Date.now(),
      ...(parsed.checkoutFingerprint ? { checkoutFingerprint: String(parsed.checkoutFingerprint) } : {}),
      ...(parsed.authUid ? { authUid: String(parsed.authUid) } : {}),
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('Saved payment attempt')) throw error;
    throw new Error('Saved payment attempt could not be read. Checkout is blocked to avoid creating duplicate orders.');
  }
}

export async function clearPendingPaymentAttempt(expectedPaymentAttemptId: string) {
  await serializeStorageWrite(async () => {
    const existing = await getPendingPaymentAttempt();
    if (!existing || existing.paymentAttemptId !== expectedPaymentAttemptId) return;
    await AsyncStorage.removeItem(STORAGE_KEY);
  });
}
