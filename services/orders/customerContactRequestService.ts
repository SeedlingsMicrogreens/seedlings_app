import { addDoc, collection, doc, getDoc, serverTimestamp } from '../core/firestore';
import { auth, db } from '../core/firebaseClient';
import { normalizeIndianMobile } from '../clientOnboarding';

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
  const ref = await addDoc(collection(db, 'enquiries'), {
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
  });
  return ref.id;
}
