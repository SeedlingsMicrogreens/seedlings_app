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
};

export async function savePendingPaymentAttempt(attempt: PendingPaymentAttempt) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(attempt));
}

export async function getPendingPaymentAttempt(): Promise<PendingPaymentAttempt | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingPaymentAttempt;
    if (!parsed.paymentAttemptId || !Array.isArray(parsed.orderIds)) return null;
    return {
      paymentAttemptId: String(parsed.paymentAttemptId),
      ...(parsed.cashfreeOrderId ? { cashfreeOrderId: String(parsed.cashfreeOrderId) } : {}),
      orderIds: parsed.orderIds.map(String).filter(Boolean),
      primaryOrderId: String(parsed.primaryOrderId ?? ''),
      primaryOrderNumber: String(parsed.primaryOrderNumber ?? ''),
      total: Number(parsed.total) || 0,
      createdAt: Number(parsed.createdAt) || Date.now(),
    };
  } catch {
    return null;
  }
}

export async function clearPendingPaymentAttempt() {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
