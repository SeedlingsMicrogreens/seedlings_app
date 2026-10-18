import AsyncStorage from '@react-native-async-storage/async-storage';

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

let storageQueue: Promise<void> = Promise.resolve();

function serializeStorageWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = storageQueue.then(operation, operation);
  storageQueue = result.then(() => undefined, () => undefined);
  return result;
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

/**
 * Records the payment attempt of a checkout the server claim just approved
 * (created or resumed). The server has already resolved or cancelled any
 * previous checkout, so an older local marker is replaced, not recovered.
 */
export async function replacePendingPaymentAttempt(attempt: PendingPaymentAttempt) {
  await serializeStorageWrite(async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...attempt, createdAt: attempt.createdAt || Date.now() }));
  });
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
