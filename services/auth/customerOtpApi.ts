import { Platform } from 'react-native';

export type SendCustomerOtpResult = {
  success: true;
  demo: boolean;
  demoOtp?: string;
  expiresAt?: string;
};

export type VerifyCustomerOtpResult = {
  success: true;
  customToken: string;
  customerId?: string;
  isNew?: boolean;
};

const API_TIMEOUT_MS = 20_000;

function getAuthApiBaseUrl(): string {
  const value = process.env.EXPO_PUBLIC_WEBSITE_API_URL?.trim().replace(/\/$/, '');
  if (!value) {
    throw new Error(
      'Authentication service is not configured. Set EXPO_PUBLIC_WEBSITE_API_URL to the Seedlings server URL.',
    );
  }
  return value;
}

function normalizeIndianMobile(value: string): string {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 10 ? digits : '';
}

async function readPayload(response: Response): Promise<Record<string, unknown>> {
  try {
    const payload = await response.json();
    return payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function getServerError(payload: Record<string, unknown>, fallback: string): string {
  const value = payload.error ?? payload.message;
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

async function postAuth<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(`${getAuthApiBaseUrl()}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Seedlings-Client': Platform.OS,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await readPayload(response);
    if (!response.ok) {
      throw new Error(getServerError(payload, `Authentication request failed (${response.status}).`));
    }

    return payload as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The Seedlings authentication server did not respond in time. Check your connection and try again.');
    }
    if (error instanceof TypeError && /fetch/i.test(error.message)) {
      const baseUrl = getAuthApiBaseUrl();
      throw new Error(
        `Could not connect to the Seedlings authentication server (${baseUrl}). Check your internet connection and server URL. If using Expo Web locally, the Website API must allow http://localhost:8081 through CORS. Android native requests do not use browser CORS; confirm the device can reach the server.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendCustomerOtp(
  mobile: string,
  forceResend = false,
): Promise<SendCustomerOtpResult> {
  const normalizedMobile = normalizeIndianMobile(mobile);
  if (!normalizedMobile) throw new Error('Invalid mobile number.');

  const result = await postAuth<Partial<SendCustomerOtpResult>>(
    '/api/customer/auth/send-otp',
    {
      mobile: normalizedMobile,
      resend: forceResend,
    },
  );

  if (result.success !== true) {
    throw new Error('Unable to send OTP. Please try again.');
  }

  const demo = result.demo === true;
  if (demo) {
    const demoOtp = String(result.demoOtp ?? '').trim();
    if (!/^\d{4}$/.test(demoOtp)) {
      throw new Error('Demo authentication server returned an invalid OTP.');
    }
    return { success: true, demo: true, demoOtp, expiresAt: result.expiresAt };
  }

  return { success: true, demo: false, expiresAt: result.expiresAt };
}

export async function verifyCustomerOtp(
  mobile: string,
  otp: string,
): Promise<VerifyCustomerOtpResult> {
  const normalizedMobile = normalizeIndianMobile(mobile);
  const normalizedOtp = String(otp || '').trim();

  if (!normalizedMobile) throw new Error('Invalid mobile number.');
  if (!/^\d{4}$/.test(normalizedOtp)) {
    throw new Error('Enter the 4-digit verification code.');
  }

  const result = await postAuth<Partial<VerifyCustomerOtpResult>>(
    '/api/customer/auth/verify-otp',
    {
      mobile: normalizedMobile,
      otp: normalizedOtp,
    },
  );

  if (result.success !== true || typeof result.customToken !== 'string' || !result.customToken.trim()) {
    throw new Error('Authentication server did not return a valid Firebase session token.');
  }

  return {
    success: true,
    customToken: result.customToken,
    customerId: typeof result.customerId === 'string' ? result.customerId : normalizedMobile,
    isNew: result.isNew === true,
  };
}
