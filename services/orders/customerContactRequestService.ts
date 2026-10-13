import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc } from '../core/firestore';
import { auth, db } from '../core/firebaseClient';
import { normalizeIndianMobile } from '../clientOnboarding';
import { unserviceablePincodeEnquiryId } from './checkoutAttemptUtils';
import { stripUndefined } from '../core/firestoreData';

function formatDate(value: string) {
  if (!value) return 'the requested date';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export async function submitAvailabilityContactRequest(args: {
  mobile: string;
  productId: string;
  productName: string;
  requestedGrams: number;
  requestedDeliveryDate: string;
  resolvedDeliveryDate?: string;
  address?: Record<string, unknown>;
  requestId?: string;
}) {
  const mobile = normalizeIndianMobile(args.mobile);
  const authUid = auth.currentUser?.uid;
  if (!mobile || !authUid) throw new Error('Please sign in again before sending an enquiry.');
  const customerSnap = await getDoc(doc(collection(db, 'customers'), mobile));
  if (!customerSnap.exists()) throw new Error('Customer account not found.');
  const customer = customerSnap.data() || {};
  const productName = String(args.productName || 'Product').trim() || 'Product';
  const requested = Math.max(0, Math.floor(Number(args.requestedGrams) || 0));
  const resolved = String(args.resolvedDeliveryDate || '').trim();
  const message = resolved
    ? `Customer requested ${requested.toLocaleString()}g ${productName} for ${formatDate(args.requestedDeliveryDate)}, but the full requested quantity was not available. Customer chose not to move the delivery date. The full quantity was available on ${formatDate(resolved)}.`
    : `Customer requested ${requested.toLocaleString()}g ${productName} for ${formatDate(args.requestedDeliveryDate)}, but the full requested quantity was not available. Customer requested to be contacted.`;
  const enquiryData = {
    customerId: mobile,
    authUid,
    name: String(customer.name || 'Customer').trim(),
    mobile,
    email: String(customer.email || '').trim(),
    productId: String(args.productId || '').trim(),
    productName,
    message,
    source: 'customer_checkout',
    status: 'open',
    requestedQuantityGrams: requested,
    requestedDeliveryDate: String(args.requestedDeliveryDate || '').trim(),
    ...(resolved ? { resolvedDeliveryDate: resolved } : {}),
    enquiryReason: 'AVAILABILITY_SHORTAGE',
    contactRequired: true,
    ...(args.address ? { address: args.address } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (!args.requestId) {
    const ref = await addDoc(collection(db, 'enquiries'), enquiryData);
    return ref.id;
  }

  const ref = doc(db, 'enquiries', args.requestId);
  try {
    await setDoc(ref, enquiryData);
  } catch (writeError) {
    try {
      const saved = await getDoc(ref);
      const data = saved.data();
      if (saved.exists()
        && data?.authUid === authUid
        && data?.customerId === mobile
        && data?.productId === args.productId
        && data?.requestedDeliveryDate === args.requestedDeliveryDate
        && data?.resolvedDeliveryDate === resolved
        && data?.requestedQuantityGrams === requested
        && data?.enquiryReason === 'AVAILABILITY_SHORTAGE') {
        return ref.id;
      }
    } catch {
      throw writeError;
    }
    throw writeError;
  }
  return ref.id;
}

export async function submitUnserviceablePincodeEnquiry(args: {
  mobile: string;
  pincode: string;
  addressId: string;
  address: Record<string, unknown>;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    selectedWeight: string;
    deliveryDate?: string;
  }>;
}) {
  const mobile = normalizeIndianMobile(args.mobile);
  const authUid = auth.currentUser?.uid;
  const pincode = String(args.pincode || '').replace(/\D/g, '');
  const addressId = String(args.addressId || '').trim();
  if (!mobile || !authUid) throw new Error('Please sign in again before sending an enquiry.');
  if (!/^\d{6}$/.test(pincode)) throw new Error('A valid 6-digit pincode is required to send this enquiry.');
  if (!addressId) throw new Error('Select a delivery address before sending this enquiry.');

  const customerSnap = await getDoc(doc(collection(db, 'customers'), mobile));
  if (!customerSnap.exists()) throw new Error('Customer account not found.');
  const customer = customerSnap.data() || {};
  const enquiryRef = doc(db, 'enquiries', unserviceablePincodeEnquiryId(authUid, pincode, addressId));

  const requestedItems = args.items.map((item) => ({
    productId: String(item.productId || '').trim(),
    productName: String(item.productName || 'Product').trim() || 'Product',
    quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
    selectedWeight: String(item.selectedWeight || '').trim(),
    deliveryDate: String(item.deliveryDate || '').trim(),
  }));
  const itemSummary = requestedItems.map((item) => `${item.quantity} × ${item.productName}${item.selectedWeight ? ` (${item.selectedWeight})` : ''}`).join(', ');
  const data = stripUndefined({
    customerId: mobile,
    authUid,
    name: String(customer.name || 'Customer').trim(),
    mobile,
    email: String(customer.email || '').trim(),
    productName: 'Delivery service enquiry',
    message: `Customer requested delivery to pincode ${pincode}, which is not currently serviceable.${itemSummary ? ` Cart items: ${itemSummary}.` : ''}`,
    source: 'customer_checkout',
    status: 'open',
    enquiryReason: 'NON_SERVICEABLE_PINCODE',
    contactRequired: true,
    pincode,
    addressId,
    address: args.address,
    requestedItems,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await setDoc(enquiryRef, data);
  } catch (writeError) {
    try {
      const saved = await getDoc(enquiryRef);
      const savedData = saved.data();
      const savedItems = Array.isArray(savedData?.requestedItems) ? savedData.requestedItems : [];
      const savedAddress = savedData?.address && typeof savedData.address === 'object'
        ? savedData.address as Record<string, unknown>
        : {};
      const addressFields = ['label', 'name', 'mobileNumber', 'addressLine1', 'addressLine2', 'landmark', 'city', 'state', 'pincode'];
      const matchingAddress = addressFields.every((field) =>
        String(savedAddress[field] ?? '') === String(args.address[field] ?? ''),
      );
      const matchingItems = savedItems.length === requestedItems.length && requestedItems.every((requested, index) => {
        const savedItem = savedItems[index] as Record<string, unknown>;
        return savedItem.productId === requested.productId
          && savedItem.quantity === requested.quantity
          && savedItem.selectedWeight === requested.selectedWeight
          && savedItem.deliveryDate === requested.deliveryDate;
      });
      if (saved.exists()
        && savedData?.authUid === authUid
        && savedData?.customerId === mobile
        && savedData?.pincode === pincode
        && savedData?.addressId === addressId
        && matchingAddress
        && matchingItems) return enquiryRef.id;
    } catch {
      throw writeError;
    }
    throw writeError;
  }
  return enquiryRef.id;
}
