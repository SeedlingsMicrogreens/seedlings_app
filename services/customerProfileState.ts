import type { CachedCustomerRecord } from './customerCache';

export type CustomerProfileState = {
  mobile?: string;
  countryCode?: string;
  phoneE164?: string;
  name?: string;
  email?: string;
  status?: string;
  onboardingStatus?: string;
  preferredDeliveryDay?: string;
  deliveryDay?: string;
  photoUrl?: string;
  profilePhotoUrl?: string;
};

export function mergeCustomerProfileCacheValues(
  current: Record<string, unknown> | null | undefined,
  next: Partial<CustomerProfileState> | null | undefined,
): CachedCustomerRecord {
  const base = { ...(current ?? {}) } as Record<string, unknown>;
  const merged = { ...base } as CachedCustomerRecord;

  merged.mobile = String(next?.mobile ?? base.mobile ?? '');
  if (typeof next?.name === 'string') merged.name = next.name;
  if (typeof next?.email === 'string') merged.email = next.email;
  if (typeof next?.status === 'string') merged.status = next.status;
  if (typeof next?.onboardingStatus === 'string') merged.onboardingStatus = next.onboardingStatus;
  if (typeof next?.preferredDeliveryDay === 'string') merged.preferredDeliveryDay = next.preferredDeliveryDay;
  if (typeof next?.deliveryDay === 'string') merged.deliveryDay = next.deliveryDay;
  if (typeof next?.countryCode === 'string') merged.countryCode = next.countryCode;
  if (typeof next?.phoneE164 === 'string') merged.phoneE164 = next.phoneE164;

  if (typeof next?.profilePhotoUrl === 'string') {
    merged.profilePhotoUrl = next.profilePhotoUrl;
    merged.photoUrl = next.profilePhotoUrl;
  } else if (typeof next?.photoUrl === 'string') {
    merged.profilePhotoUrl = next.photoUrl;
    merged.photoUrl = next.photoUrl;
  } else if (
    typeof next?.profilePhotoUrl === 'undefined' &&
    typeof next?.photoUrl === 'undefined' &&
    'profilePhotoUrl' in base
  ) {
    merged.profilePhotoUrl = undefined;
    merged.photoUrl = undefined;
  }

  return merged;
}
