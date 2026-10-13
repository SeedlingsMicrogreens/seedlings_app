import { Platform } from 'react-native';
import type { CustomerAuthUser } from '../core/customerAuth';
import { sendCustomerOtp, verifyCustomerOtp, type SendCustomerOtpResult } from './customerOtpApi';

let activePhoneNumber: string | null = null;
let requestInFlight = false;

export type CustomerOtpRequest = SendCustomerOtpResult;

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
  const result = await verifyCustomerOtp(mobile, otp);

  try {
    if (Platform.OS === 'web') {
      const { signInWithCustomToken } = await import('firebase/auth');
      const { auth } = await import('../core/firebaseClient');
      const credential = await signInWithCustomToken(auth, result.customToken);
      return {
        uid: credential.user.uid,
        phoneNumber: credential.user.phoneNumber ?? null,
      };
    }

    const { auth } = await import('../core/firebaseClient');
    const { signInWithCustomToken } = await import('firebase/auth');
    const credential = await signInWithCustomToken(auth, result.customToken);
    return {
      uid: credential.user.uid,
      phoneNumber: credential.user.phoneNumber ?? null,
    };
  } finally {
    activePhoneNumber = null;
  }
}

export function clearCustomerPhoneAuth(): void {
  activePhoneNumber = null;
  requestInFlight = false;
}
