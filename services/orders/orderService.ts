import { addDoc, collection, doc, getDoc, getDocs, query, where, serverTimestamp } from '../core/firestore';
import { auth, db } from '../core/firebaseClient';
import { normalizeIndianMobile } from '../clientOnboarding';
import type { CartItem } from '../cart/cartService';
import type { CustomerAddress } from '../customerAddresses';
import type { PaymentTransaction } from '../payments/paymentService';
import { checkProductAvailability, nextWeekSaturday } from './customerOrderAvailability';
import { calculateCheckoutDeliveryCharges } from './deliveryChargeService';
import { stripUndefined } from '../core/firestoreData';

export type CreateCustomerOrderInput = { mobile: string; items: CartItem[]; address: CustomerAddress; paymentMethod?: 'online'; deliverySlot: string; shortageDecision?: 'continue' | 'contact' };

function createOrderNumber() {
  const now = new Date();
  return `SM${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}${String(now.getTime()).slice(-6)}`;
}

export async function createCustomerOneTimeOrder(input: CreateCustomerOrderInput) {
  const mobile = normalizeIndianMobile(input.mobile);
  if (!mobile) throw new Error('Invalid customer mobile number.');
  const authUid = auth.currentUser?.uid;
  if (!authUid) throw new Error('Your login session expired. Please sign in again.');
  if (!input.items.length) throw new Error('Your cart is empty.');
  if (!input.deliverySlot?.trim()) throw new Error('Please select a weekend delivery slot.');

  const customerSnapshot = await getDoc(doc(db, 'customers', mobile));
  if (!customerSnapshot.exists()) throw new Error('Customer account not found.');
  const customer = customerSnapshot.data();
  if (customer.status === 'blocked') throw new Error('Your customer account is blocked.');
  const saved = Array.isArray(customer.addresses) ? customer.addresses : [];
  const selectedAddress = saved.find((a) => String(a?.id ?? '') === input.address.id);
  if (!selectedAddress) throw new Error('Selected delivery address is no longer available.');

  const productDocs = await getDocs(collection(db, 'salesProducts'));
  const products = new Map(productDocs.docs.map((s) => [s.id, { id: s.id, ...s.data() }]));
  const deliveryDate = nextWeekSaturday();

  const availabilityResults = await Promise.all(input.items.map(async (item) => {
    const product = products.get(item.id);
    if (!product || product.active !== true) throw new Error(`${item.name} is no longer available.`);
    if (product.oneTimePurchase !== true) throw new Error(`${item.name} is not available for one-time purchase.`);
    return checkProductAvailability({ product: product as any, quantity: item.quantity, deliveryDate });
  }));
  const shortage = availabilityResults.some((result) => result.hasShortage);
  if (shortage && !input.shortageDecision) throw new Error('HARVEST_SHORTAGE_CONFIRMATION_REQUIRED');

  const orderItems = input.items.map((item) => {
    const product = products.get(item.id);
    if (!product || product.active !== true) throw new Error(`${item.name} is no longer available.`);
    if (product.oneTimePurchase !== true) throw new Error(`${item.name} is not available for one-time purchase.`);
    const unitPrice = Number(product.sellingPrice);
    const mrp = Number(product.mrp ?? unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error(`Price unavailable for ${item.name}.`);
    if (!Number.isFinite(mrp) || mrp < unitPrice) throw new Error(`Invalid MRP for ${item.name}.`);
    const quantity = Math.max(1, Math.floor(item.quantity));
    const components = Array.isArray(product.components) ? product.components : [];
    const weightGrams = components.reduce((sum, component) => sum + Number(component?.quantityGrams || 0), 0);
    return {
      salableProductId: product.id,
      salableProductSku: typeof product.sku === 'string' ? product.sku.trim() : '',
      salableProductType: product.type === 'multiple' ? 'multiple' : 'single',
      productId: product.id,
      productName: String(product.name ?? item.name).trim(),
      productSlug: typeof product.slug === 'string' ? product.slug.trim() : '',
      sellingOptionId: product.id,
      sellingOptionLabel: product.type === 'multiple' ? 'Combo' : (weightGrams ? `${weightGrams}g` : 'Single'),
      weightGrams,
      quantity,
      mrp,
      unitPrice,
      lineTotal: unitPrice * quantity,
      imageUrl: typeof product.imageUrl === 'string' ? product.imageUrl.trim() : '',
    };
  });

  const mrpSubtotal = orderItems.reduce((sum, item) => sum + Number(item.mrp) * Number(item.quantity), 0);
  const subtotal = orderItems.reduce((sum, item) => sum + Number(item.lineTotal), 0);
  const productSavings = Math.max(0, mrpSubtotal - subtotal);
  const delivery = await calculateCheckoutDeliveryCharges({ pincode: String(selectedAddress.pincode ?? ''), oneTime: true, subscriptions: [] });
  const charge = delivery.oneTime;
  const deliveryFee = charge.finalCharge;
  const total = subtotal + deliveryFee;
  const requestedAvailabilityGrams = availabilityResults.reduce((sum, result) => sum + result.requestedGrams, 0);
  const availableAvailabilityGrams = availabilityResults.reduce((sum, result) => sum + result.availableGrams, 0);
  const shortageAvailabilityGrams = availabilityResults.reduce((sum, result) => sum + result.shortageGrams, 0);

  const order = stripUndefined({
    authUid,
    orderNumber: createOrderNumber(),
    customerId: mobile,
    customerName: typeof customer.name === 'string' ? customer.name.trim() : '',
    customerMobile: typeof customer.mobileNumber === 'string' ? customer.mobileNumber.trim() : mobile,
    items: orderItems,
    subtotal,
    deliveryFee,
    discount: productSavings,
    total,
    currency: 'INR',
    paymentStatus: 'pending',
    paymentMethod: 'online',
    status: 'pending_payment',
    deliveryAddress: selectedAddress,
    scheduledDeliveryDate: deliveryDate,
    deliveryDate,
    deliverySlot: input.deliverySlot.trim(),
    notes: '',
    orderType: 'one_time',
    subscriptionId: null,
    deliveryChargeId: charge.sourceId,
    deliveryChargeName: charge.sourceName,
    deliveryChargeSnapshot: deliveryFee,
    deliveryChargeDetails: charge.snapshot,
    packingStatus: 'pending',
    requiresCustomerContact: input.shortageDecision === 'contact',
    availabilityRequestedGrams: requestedAvailabilityGrams,
    availabilityAvailableGrams: availableAvailabilityGrams,
    availabilityShortageGrams: shortageAvailabilityGrams,
    carryForwardQuantityGrams: 0,
    availabilityDecision: input.shortageDecision || 'continue',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const orderRef = await addDoc(collection(db, 'orders'), order);
  return { id: orderRef.id, orderNumber: order.orderNumber, paymentStatus: order.paymentStatus, total };
}


export type CustomerOrder = {
  id: string;
  orderNumber?: string;
  customerId: string;
  customerName?: string;
  customerMobile?: string;
  items?: Array<Record<string, unknown>>;
  subtotal?: number;
  deliveryFee?: number;
  deliveryCharge?: number;
  discount?: number;
  discountTotal?: number;
  mrpTotal?: number;
  total?: number;
  totalAmount?: number;
  currency?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  status?: string;
  deliveryStatus?: string;
  deliveryPartnerId?: string;
  assignedDeliveryPartnerId?: string;
  statusHistory?: Array<Record<string, unknown>>;
  deliveryAddress?: Record<string, unknown>;
  deliveryAddressSnapshot?: Record<string, unknown>;
  orderType?: string;
  packingStatus?: string;
  createdAt?: unknown;
  scheduledDeliveryDate?: string;
  paymentTransactions?: PaymentTransaction[];
  transactionId?: string;
};

function timestampMillis(value: unknown) {
  if (value && typeof value === 'object' && 'toMillis' in value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (typeof value === 'string') return Date.parse(value) || 0;
  return 0;
}

export async function getCustomerOrders(mobileInput: string): Promise<CustomerOrder[]> {
  const mobile = normalizeIndianMobile(mobileInput);
  if (!mobile) throw new Error('Invalid customer mobile number.');
  const snapshot = await getDocs(query(collection(db, 'orders'), where('customerId', '==', mobile)));
  return snapshot.docs
    .map((item) => ({ id: item.id, ...(item.data() as Omit<CustomerOrder, 'id'>) }))
    .sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
}

export async function getCustomerOrder(mobileInput: string, orderId: string): Promise<CustomerOrder | null> {
  const mobile = normalizeIndianMobile(mobileInput);
  if (!mobile || !orderId) return null;
  const snapshot = await getDoc(doc(db, 'orders', orderId));
  if (!snapshot.exists()) return null;
  const order = { id: snapshot.id, ...(snapshot.data() as Omit<CustomerOrder, 'id'>) };
  if (order.customerId !== mobile) return null;
  return order;
}
