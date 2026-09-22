import Constants from 'expo-constants';
import { getIdToken } from 'firebase/auth';
import { Platform } from 'react-native';
import { auth } from '../core/firebaseClient';
import {
  CFPaymentGatewayService,
  type CFCallback,
  type CFErrorResponse,
} from 'react-native-cashfree-pg-sdk';
import {
  CFEnvironment,
  CFSession,
} from 'cashfree-pg-api-contract';

export const CUSTOMER_PAYMENT_METHODS = ['UPI', 'Card', 'Wallet'] as const;
export type CustomerPaymentMethod = (typeof CUSTOMER_PAYMENT_METHODS)[number];

export type PaymentStatus = 'pending' | 'partially_paid' | 'paid' | 'failed' | 'refunded' | string;

export type PaymentTransaction = {
  id?: string;
  amount?: number;
  method?: string;
  status?: string;
  receiptUrl?: string;
  receiptPath?: string;
  transactionId?: string;
  createdAt?: unknown;
};

export type CashfreePaymentSession = {
  cashfreeOrderId: string;
  paymentSessionId: string;
  amount: number;
};

export type CashfreeVerificationResult = {
  status: 'paid' | 'failed' | 'pending';
  orderId?: string;
  amount?: number;
  transactionId?: string;
  message?: string;
};

function getWebsiteApiBaseUrl(): string {
  const value = process.env.EXPO_PUBLIC_WEBSITE_API_URL?.trim().replace(/\/$/, '');
  if (!value) {
    throw new Error(
      'Payment service is not configured. Set EXPO_PUBLIC_WEBSITE_API_URL to the Seedlings Website URL.',
    );
  }
  return value;
}

const AUTH_TOKEN_TIMEOUT_MS = 15_000;

async function getFirebaseIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Customer session not found. Please log in again.');
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error('Customer authentication is taking too long. Please log in again and retry.')), AUTH_TOKEN_TIMEOUT_MS);
    });
    return await Promise.race([getIdToken(user, true), timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

const PAYMENT_API_TIMEOUT_MS = 30_000;
const CASHFREE_CALLBACK_TIMEOUT_MS = 120_000;

async function callPaymentApi<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const baseUrl = getWebsiteApiBaseUrl();
  console.log(`[Cashfree][API] POST ${path} via ${baseUrl}`);
  const token = await getFirebaseIdToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PAYMENT_API_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    console.log(`[Cashfree][API] ${path} response status=${response.status}`);

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // Keep the HTTP error below useful even when the server returns no JSON.
    }

    if (!response.ok) {
      const message =
        payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error?: unknown }).error ?? '')
          : '';
      throw new Error(message || `Payment service request failed (${response.status}).`);
    }

    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Unable to reach the payment server. Please check your internet connection and try again.');
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Unable to reach the payment server. Please check your internet connection and try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function createCashfreePaymentSession(
  orderIds: string[],
  customerMobile: string,
): Promise<CashfreePaymentSession> {
  const uniqueOrderIds = [...new Set(orderIds.filter(Boolean))];
  if (!uniqueOrderIds.length) {
    throw new Error('No pending order was created for payment.');
  }

  console.log(`[Cashfree][Checkout] requesting payment session for ${uniqueOrderIds.length} order(s)`);
  const result = await callPaymentApi<Partial<CashfreePaymentSession>>(
    '/api/cashfree/create-payment-session',
    {
      orderIds: uniqueOrderIds,
      customerMobile,
    },
  );

  if (!result.cashfreeOrderId || !result.paymentSessionId) {
    throw new Error('Cashfree payment session was not created.');
  }

  console.log('[Cashfree][Checkout] payment session received');

  return {
    cashfreeOrderId: result.cashfreeOrderId,
    paymentSessionId: result.paymentSessionId,
    amount: Number(result.amount ?? 0),
  };
}

export async function verifyCashfreePayment(
  cashfreeOrderId: string,
): Promise<CashfreeVerificationResult> {
  if (!cashfreeOrderId) {
    throw new Error('Cashfree order ID is missing.');
  }

  console.log('[Cashfree][Verify] requesting server-side payment verification');
  const result = await callPaymentApi<CashfreeVerificationResult>(
    '/api/cashfree/verify-payment',
    { cashfreeOrderId },
  );

  console.log(`[Cashfree][Verify] server status=${result.status}`);

  if (!['paid', 'failed', 'pending'].includes(result.status)) {
    throw new Error('Payment verification returned an unknown status.');
  }

  return result;
}

export async function startCashfreePayment(
  session: CashfreePaymentSession,
): Promise<CashfreeVerificationResult> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    throw new Error('Cashfree checkout requires a native Android or iOS build. Expo Go and web are not supported.');
  }

  const configuredEnvironment = String(
    Constants.expoConfig?.extra?.cashfree?.environment ?? 'sandbox',
  ).toLowerCase();

  const environment =
    configuredEnvironment === 'production'
      ? CFEnvironment.PRODUCTION
      : CFEnvironment.SANDBOX;

  console.log(`[Cashfree][SDK] opening ${environment === CFEnvironment.PRODUCTION ? 'production' : 'sandbox'} checkout`);

  return new Promise<CashfreeVerificationResult>((resolve, reject) => {
    let settled = false;
    let callbackTimeout: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (callbackTimeout) clearTimeout(callbackTimeout);
      CFPaymentGatewayService.removeCallback();
    };

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    const verifyAfterMissingCallback = async () => {
      console.warn('[Cashfree][SDK] callback timeout; checking server-side payment status');
      try {
        const result = await verifyCashfreePayment(session.cashfreeOrderId);
        finish(() => {
          if (result.status === 'paid') {
            resolve(result);
          } else if (result.status === 'pending') {
            reject(new Error('Cashfree checkout did not return a payment result. Payment is still pending. Please verify the payment status before trying again.'));
          } else {
            reject(new Error(result.message || 'Cashfree checkout did not return a payment result. Payment failed.'));
          }
        });
      } catch {
        finish(() => reject(new Error('Cashfree checkout did not return a payment result. Please check your payment status before trying again.')));
      }
    };

    const callback: CFCallback = {
      onVerify: (orderID: string) => {
        console.log('[Cashfree][SDK] onVerify callback received');
        void verifyCashfreePayment(orderID || session.cashfreeOrderId)
          .then((result) => {
            finish(() => resolve(result));
          })
          .catch((error) => {
            finish(() => reject(error));
          });
      },
      onError: (error: CFErrorResponse, orderID: string) => {
        const message = error?.getMessage?.() || 'Cashfree payment failed.';
        console.warn(`[Cashfree][SDK] onError callback received: ${message}`);
        void verifyCashfreePayment(orderID || session.cashfreeOrderId)
          .then((result) => {
            finish(() => {
              if (result.status === 'paid') {
                resolve(result);
              } else if (result.status === 'pending') {
                reject(new Error('Payment is still pending. Please verify the payment status before trying again.'));
              } else {
                reject(new Error(message));
              }
            });
          })
          .catch(() => {
            finish(() => reject(new Error(message)));
          });
      },
    };

    try {
      const cfSession = new CFSession(
        session.paymentSessionId,
        session.cashfreeOrderId,
        environment,
      );

      CFPaymentGatewayService.setCallback(callback);
      console.log('[Cashfree][SDK] callback registered');
      CFPaymentGatewayService.doWebPayment(cfSession);
      console.log('[Cashfree][SDK] doWebPayment invoked');
      callbackTimeout = setTimeout(() => {
        void verifyAfterMissingCallback();
      }, CASHFREE_CALLBACK_TIMEOUT_MS);
    } catch (error) {
      finish(() => reject(error instanceof Error ? error : new Error('Unable to open Cashfree checkout.')));
    }
  });
}

export function prettyPaymentStatus(status?: string) {
  return String(status || 'pending')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (value) => value.toUpperCase());
}

export function paymentStatusMessage(status?: string) {
  switch (status) {
    case 'paid': return 'Payment received';
    case 'partially_paid': return 'Partially paid';
    case 'failed': return 'Payment failed';
    case 'refunded': return 'Payment refunded';
    default: return 'Payment pending';
  }
}

export function isPaymentGatewayConfigured() {
  return Boolean(process.env.EXPO_PUBLIC_WEBSITE_API_URL?.trim());
}
