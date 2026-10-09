import { mergeGuestCartIntoCustomer } from './cart/cartPersistence';
import { confirmCustomerOtp, requestCustomerOtp, type CustomerOtpRequest } from './auth/customerPhoneAuth';
import { getDatabase } from '../storage/sqlite';

export function normalizeIndianMobile(value: string): string {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 10 ? digits : '';
}

export function getStoredCustomerMobile(): string | null {
  const row = getDatabase().getFirstSync<{ value: string }>(
    'SELECT value FROM app_meta WHERE key = ?',
    'customer_mobile',
  );
  const mobile = row?.value ? normalizeIndianMobile(row.value) : null;
  return mobile || null;
}

/**
 * Request a server-generated 4-digit OTP. The server owns OTP generation,
 * expiry, invalidation and SMS delivery.
 */
export async function requestClientOtp(
  mobile: string,
  forceResend = false,
): Promise<CustomerOtpRequest> {
  const normalizedMobile = normalizeIndianMobile(mobile);
  if (!normalizedMobile) throw new Error('Invalid mobile number.');

  return requestCustomerOtp(normalizedMobile, forceResend);
}

/**
 * Verify the server OTP, establish the Firebase Custom Token session, and
 * merge the pre-login guest cart into the authenticated customer scope.
 * Customer/Firebase identity creation is server-owned.
 */
export async function ensureClientOnboarding(
  mobile: string,
  otp: string,
): Promise<{ customerId: string; isNew: boolean }> {
  const normalizedMobile = normalizeIndianMobile(mobile);
  if (!normalizedMobile) throw new Error('Invalid mobile number.');

  const firebaseUser = await confirmCustomerOtp(otp);
  if (!firebaseUser.uid) {
    throw new Error('Customer authentication identity could not be established.');
  }

  mergeGuestCartIntoCustomer(normalizedMobile);

  return {
    customerId: normalizedMobile,
    isNew: false,
  };
}
