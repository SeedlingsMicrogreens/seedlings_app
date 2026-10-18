import type { CustomerAuthUser } from '../core/customerAuth';
import {
  sendCustomerOtp,
  verifyCustomerOtp,
  type SendCustomerOtpResult,
  type VerifyCustomerOtpResult,
} from './customerOtpApi';

let activePhoneNumber: string | null = null;
let requestInFlight = false;

export type CustomerOtpRequest = SendCustomerOtpResult;
export type CustomerAuthenticationFailureStage = 'otp-api' | 'firebase-session';

export class CustomerAuthenticationError extends Error {
  readonly cause: unknown;
  readonly code?: string;

  constructor(
    readonly stage: CustomerAuthenticationFailureStage,
    message: string,
    cause: unknown,
  ) {
    super(message);
    this.name = 'CustomerAuthenticationError';
    this.cause = cause;
    this.code = getErrorCode(cause);
  }
}

function getErrorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return undefined;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error.';
}

function normalizeIndianMobile(value: string): string {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 10 ? digits : '';
}

/**
 * Customer OTP is issued and verified by the trusted Seedlings server.
 * Firebase Phone Authentication is intentionally not used.
 */
export async function requestCustomerOtp(
  mobile: string,
  forceResend = false,
): Promise<CustomerOtpRequest> {
  const normalized = normalizeIndianMobile(mobile);
  if (!normalized) throw new Error('Invalid mobile number.');
  if (requestInFlight) throw new Error('OTP request is already in progress.');

  requestInFlight = true;
  try {
    const result = await sendCustomerOtp(normalized, forceResend);
    activePhoneNumber = normalized;
    return result;
  } finally {
    requestInFlight = false;
  }
}

/**
 * Verifies the server-issued 4-digit OTP and exchanges the successful result
 * for a Firebase Custom Token. Token creation remains server-side.
 */
export async function confirmCustomerOtp(code: string): Promise<CustomerAuthUser> {
  const otp = String(code || '').trim();
  if (!/^\d{4}$/.test(otp)) {
    throw new Error('Enter the 4-digit verification code.');
  }

  if (!activePhoneNumber) {
    throw new Error('No active OTP verification session. Please request a new OTP.');
  }

  const mobile = activePhoneNumber;
  let result: VerifyCustomerOtpResult;
  try {
    result = await verifyCustomerOtp(mobile, otp);
  } catch (error) {
    throw new CustomerAuthenticationError(
      'otp-api',
      `OTP verification API failed: ${getErrorMessage(error)}`,
      error,
    );
  }

  try {
    const { signInWithCustomerCustomToken } = await import('../core/firebaseClient');
    return await signInWithCustomerCustomToken(result.customToken);
  } catch (error) {
    const code = getErrorCode(error);
    throw new CustomerAuthenticationError(
      'firebase-session',
      `Firebase customer session failed${code ? ` (${code})` : ''}: ${getErrorMessage(error)}`,
      error,
    );
  } finally {
    activePhoneNumber = null;
  }
}

export function clearCustomerPhoneAuth(): void {
  activePhoneNumber = null;
  requestInFlight = false;
}
