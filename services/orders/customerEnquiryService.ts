import { addDoc, collection, doc, getDoc, serverTimestamp } from '../core/firestore';
import { auth, db } from '../core/firebaseClient';
import { normalizeIndianMobile } from '../clientOnboarding';

function formatDate(value: string) {
  if (!value) return 'the requested delivery date';
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export async function submitHighDemandEnquiry(args: {
  mobile: string;
  productId: string;
  productName: string;
  requestedGrams: number;
  requestedDeliveryDate: string;
  thresholdGrams: number;
  address?: Record<string, unknown>;
}) {
  const mobile = normalizeIndianMobile(args.mobile);
  const authUid = auth.currentUser?.uid;
  if (!mobile || !authUid) throw new Error('Please sign in again before sending an enquiry.');

  const customerSnap = await getDoc(doc(db, 'customers', mobile));
  if (!customerSnap.exists()) throw new Error('Customer account not found.');
  const customer = customerSnap.data() || {};
  const name = String(customer.name || 'Customer').trim();
  const email = String(customer.email || '').trim();
  const requested = Math.max(0, Math.floor(Number(args.requestedGrams) || 0));
  const threshold = Math.max(0, Math.floor(Number(args.thresholdGrams) || 0));
  const productName = String(args.productName || 'Product').trim();

  const message = `Customer requested ${requested.toLocaleString()}g ${productName} for ${formatDate(args.requestedDeliveryDate)}, but current demand is above the production threshold of ${threshold.toLocaleString()}g. Customer requested to be contacted regarding the requested quantity.`;

  const ref = await addDoc(collection(db, 'enquiries'), {
    customerId: mobile,
    authUid,
    name,
    mobile,
    email,
    productId: String(args.productId || '').trim(),
    productName,
    message,
    source: 'customer_checkout',
    status: 'open',
    requestedQuantityGrams: requested,
    requestedDeliveryDate: String(args.requestedDeliveryDate || '').trim(),
    enquiryReason: 'HIGH_DEMAND',
    contactRequired: true,
    ...(args.address ? { address: args.address } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { id: ref.id };
}

export async function submitHighDemandEnquiries(args: {
  mobile: string;
  address?: Record<string, unknown>;
  items: Array<{
    productId: string;
    productName: string;
    requestedGrams: number;
    requestedDeliveryDate: string;
    thresholdGrams: number;
  }>;
}) {
  for (const item of args.items) {
    await submitHighDemandEnquiry({ mobile: args.mobile, address: args.address, ...item });
  }
}
