import { doc, getDoc, serverTimestamp, updateDoc } from './core/firestore';
import { db } from './core/firebaseClient';
import { normalizeIndianMobile } from './clientOnboarding';
import { stripUndefined } from './core/firestoreData';
import { getCachedCustomer, setCachedCustomer } from './customerCache';

export type CustomerAddress = {
  id: string;
  label?: string;
  name?: string;
  mobileNumber?: string;
  addressLine1?: string;
  addressLine2?: string;
  landmark?: string;
  city?: string;
  state?: string;
  pincode?: string;
};

function customerRef(mobile: string) {
  const normalized = normalizeIndianMobile(mobile);
  if (!normalized) throw new Error('Invalid customer mobile number.');
  return doc(db, 'customers', normalized);
}

function normalizeAddress(address: Record<string, unknown>, index: number): CustomerAddress {
  return {
    id: String(address.id || `address-${index}`),
    label: typeof address.label === 'string' ? address.label : undefined,
    name: typeof address.name === 'string' ? address.name : undefined,
    mobileNumber: typeof address.mobileNumber === 'string' ? address.mobileNumber : undefined,
    addressLine1: typeof address.addressLine1 === 'string' ? address.addressLine1 : undefined,
    addressLine2: typeof address.addressLine2 === 'string' ? address.addressLine2 : undefined,
    landmark: typeof address.landmark === 'string' ? address.landmark : undefined,
    city: typeof address.city === 'string' ? address.city : undefined,
    state: typeof address.state === 'string' ? address.state : undefined,
    pincode: typeof address.pincode === 'string' ? address.pincode : undefined,
  };
}

export async function getCustomerAddresses(mobile: string): Promise<CustomerAddress[]> {
  const normalized = normalizeIndianMobile(mobile);
  if (!normalized) throw new Error('Invalid customer mobile number.');

  const cached = getCachedCustomer(normalized);
  if (cached && Array.isArray(cached.addresses)) {
    return cached.addresses.map((address, index) =>
      normalizeAddress((address ?? {}) as Record<string, unknown>, index),
    );
  }

  const snapshot = await getDoc(customerRef(normalized));
  if (!snapshot.exists()) throw new Error('Customer account not found.');

  const data = snapshot.data();
  const addresses = (Array.isArray(data.addresses) ? data.addresses : []).map((address, index) =>
    normalizeAddress((address ?? {}) as Record<string, unknown>, index),
  );
  const existing = getCachedCustomer(normalized);
  setCachedCustomer(normalized, { ...(existing ?? {}), mobile: normalized, addresses });
  return addresses;
}

function validateAddress(address: CustomerAddress, customerMobile: string) {
  const mobile = String(address.mobileNumber ?? '').replace(/\D/g, '');
  if (!/^\d{10}$/.test(mobile)) throw new Error('Enter a valid 10-digit mobile number.');
  if (!String(address.name ?? '').trim() || !String(address.addressLine1 ?? '').trim() ||
      !String(address.city ?? '').trim() || !String(address.state ?? '').trim() ||
      !/^\d{6}$/.test(String(address.pincode ?? '').trim())) {
    throw new Error('Please complete all required address fields.');
  }
  return {
    ...address,
    label: String(address.label ?? 'Home').trim() || 'Home',
    name: String(address.name).trim(),
    mobileNumber: mobile,
    addressLine1: String(address.addressLine1).trim(),
    addressLine2: String(address.addressLine2 ?? '').trim() || undefined,
    landmark: String(address.landmark ?? '').trim() || undefined,
    city: String(address.city).trim(),
    state: String(address.state).trim(),
    pincode: String(address.pincode).trim(),
    id: address.id || `address-${Date.now()}`,
  };
}

export async function updateCustomerAddresses(mobile: string, addresses: CustomerAddress[]): Promise<void> {
  const normalized = normalizeIndianMobile(mobile);
  if (!normalized) throw new Error('Invalid customer mobile number.');
  const cleaned = addresses.map((address) => validateAddress(address, normalized));
  await updateDoc(customerRef(normalized), {
    addresses: stripUndefined(cleaned),
    updatedAt: serverTimestamp(),
  });
  const existing = getCachedCustomer(normalized);
  setCachedCustomer(normalized, { ...(existing ?? {}), mobile: normalized, addresses: cleaned });
}

export async function addCustomerAddress(mobile: string, address: Omit<CustomerAddress, 'id'>): Promise<CustomerAddress[]> {
  const current = await getCustomerAddresses(mobile);
  const next = [...current, { ...address, id: `address-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }];
  await updateCustomerAddresses(mobile, next);
  return next;
}

export async function editCustomerAddress(mobile: string, address: CustomerAddress): Promise<CustomerAddress[]> {
  const current = await getCustomerAddresses(mobile);
  if (!current.some((item) => item.id === address.id)) throw new Error('Address not found.');
  const next = current.map((item) => item.id === address.id ? address : item);
  await updateCustomerAddresses(mobile, next);
  return next;
}

export async function setDefaultCustomerAddress(mobile: string, addressId: string): Promise<CustomerAddress[]> {
  const current = await getCustomerAddresses(mobile);
  const index = current.findIndex((item) => item.id === addressId);
  if (index < 0) throw new Error('Address not found.');
  const next = [current[index], ...current.filter((_, itemIndex) => itemIndex !== index)];
  await updateCustomerAddresses(mobile, next);
  return next;
}

export async function deleteCustomerAddress(mobile: string, addressId: string): Promise<CustomerAddress[]> {
  const current = await getCustomerAddresses(mobile);
  const target = current.find((item) => item.id === addressId);
  if (!target) throw new Error('Address not found.');
  const next = current.filter((item) => item.id !== addressId);
  await updateCustomerAddresses(mobile, next);
  return next;
}
