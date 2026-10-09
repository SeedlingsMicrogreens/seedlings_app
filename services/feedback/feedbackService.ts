import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { getDocs, getDoc, collection, query, where, doc, setDoc, serverTimestamp, updateDoc } from '../core/firestore';
import { db, auth, storage } from '../core/firebaseClient';
import { normalizeIndianMobile } from '../clientOnboarding';
import { stripUndefined } from '../core/firestoreData';

export const FEEDBACK_MAX_IMAGES = 3;
export const FEEDBACK_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const FEEDBACK_ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png'] as const;

export const FEEDBACK_LIKE_OPTIONS = [
  { key: 'freshness', label: 'Freshness' },
  { key: 'packaging', label: 'Packaging' },
  { key: 'cleanliness', label: 'Cleanliness' },
  { key: 'product_quality', label: 'Product Quality' },
  { key: 'value_for_money', label: 'Value for Money' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'other', label: 'Other' },
] as const;

export const DELIVERY_PARTNER_FEEDBACK_OPTIONS = [
  { key: 'on_time', label: 'Delivered on time' },
  { key: 'less_calling', label: 'Less / appropriate calling' },
  { key: 'easy_communication', label: 'Easy communication' },
  { key: 'polite_partner', label: 'Polite delivery partner' },
  { key: 'proper_handling', label: 'Proper handling of products' },
  { key: 'right_location', label: 'Delivery at the right location' },
  { key: 'other', label: 'Other' },
] as const;

type FeedbackLikeKey = typeof FEEDBACK_LIKE_OPTIONS[number]['key'];
type DeliveryPartnerFeedbackKey = typeof DELIVERY_PARTNER_FEEDBACK_OPTIONS[number]['key'];

export type CustomerFeedback = {
  id: string;
  customerId: string;
  authUid: string;
  orderId: string;
  orderType?: string;
  productId?: string;
  deliveryPartnerId?: string;
  rating: number;
  orderRating?: number;
  deliveryRating?: number;
  comment?: string;
  positiveFeedback?: FeedbackLikeKey[];
  deliveryPartnerFeedback?: DeliveryPartnerFeedbackKey[];
  orderFeedbackOptions?: FeedbackLikeKey[];
  deliveryFeedbackOptions?: DeliveryPartnerFeedbackKey[];
  images?: string[];
  status?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type FeedbackImage = {
  uri: string;
  mimeType?: string | null;
  fileSize?: number | null;
  fileName?: string | null;
};

export type CreateCustomerFeedbackInput = {
  mobile: string;
  orderId: string;
  rating: number;
  comment?: string;
  positiveFeedback?: FeedbackLikeKey[];
  deliveryPartnerFeedback?: DeliveryPartnerFeedbackKey[];
  images?: FeedbackImage[];
};

function clean(value?: string) {
  const v = value?.trim();
  return v ? v : undefined;
}

function requireSession() {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error('Your login session expired. Please sign in again.');
  const mobile = normalizeIndianMobile(user.phoneNumber || '');
  return { uid: user.uid, authMobile: mobile };
}

function isDelivered(order: Record<string, unknown>) {
  const status = String(order.deliveryStatus ?? order.status ?? '').toLowerCase();
  return status === 'delivered';
}

export async function getCustomerFeedback(mobileInput: string): Promise<CustomerFeedback[]> {
  const mobile = normalizeIndianMobile(mobileInput);
  if (!mobile) throw new Error('Invalid customer mobile number.');
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Customer session not found. Please log in again.');

  const byUid = await getDocs(query(collection(db, 'orderFeedback'), where('authUid', '==', uid)));
  let records = byUid.docs.map(feedbackFromDoc);

  // Keep previously created Phase 12 feedback visible while all new records use authUid ownership.
  if (records.length === 0) {
    const legacy = await getDocs(query(collection(db, 'feedback'), where('customerId', '==', mobile)));
    records = legacy.docs
      .map(feedbackFromDoc)
      .filter((item) => !item.authUid || item.authUid === uid);
  }

  return records.sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
}

export async function getFeedbackForOrder(orderId: string): Promise<CustomerFeedback | null> {
  if (!orderId) return null;
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Customer session not found. Please log in again.');
  const byUid = await getDocs(query(collection(db, 'orderFeedback'), where('authUid', '==', uid)));
  let found = byUid.docs
    .map(feedbackFromDoc)
    .find((item) => item.orderId === orderId);
  if (found) return found;

  const mobile = normalizeIndianMobile(auth.currentUser?.phoneNumber || '');
  if (!mobile) return null;
  const legacy = await getDocs(query(collection(db, 'feedback'), where('customerId', '==', mobile)));
  found = legacy.docs
    .map(feedbackFromDoc)
    .find((item) => item.orderId === orderId && (!item.authUid || item.authUid === uid));
  return found ?? null;
}

export async function createCustomerFeedback(input: CreateCustomerFeedbackInput) {
  const mobile = normalizeIndianMobile(input.mobile);
  if (!mobile) throw new Error('Invalid customer mobile number.');
  const { uid } = requireSession();
  if (!input.orderId?.trim()) throw new Error('Please select a delivered order.');
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new Error('Please select a rating from 1 to 5.');

  const comment = clean(input.comment);
  if (comment && comment.length > 1000) throw new Error('Feedback must be 1000 characters or fewer.');

  const orderSnapshot = await getDoc(doc(db, 'orders', input.orderId));
  if (!orderSnapshot.exists()) throw new Error('The selected order could not be found.');
  const order = orderSnapshot.data() as Record<string, unknown>;
  if (String(order.customerId ?? '') !== mobile) throw new Error('This order does not belong to your account.');
  const orderUid = String(order.authUid ?? '').trim();
  if (orderUid && orderUid !== uid) throw new Error('This order does not belong to your current login session.');
  if (!isDelivered(order)) throw new Error('Feedback is available only after the order is delivered.');

  const existing = await getFeedbackForOrder(input.orderId);
  if (existing) throw new Error('Feedback has already been submitted for this delivery.');

  const positiveFeedback = Array.from(new Set(input.positiveFeedback ?? [])).filter((key): key is FeedbackLikeKey => FEEDBACK_LIKE_OPTIONS.some((option) => option.key === key));
  const deliveryPartnerFeedback = Array.from(new Set(input.deliveryPartnerFeedback ?? [])).filter((key): key is DeliveryPartnerFeedbackKey => DELIVERY_PARTNER_FEEDBACK_OPTIONS.some((option) => option.key === key));
  const images = input.images ?? [];
  if (images.length > FEEDBACK_MAX_IMAGES) throw new Error(`You can attach up to ${FEEDBACK_MAX_IMAGES} photos.`);

  for (const image of images) validateImage(image);

  const uploaded: Array<{ path: string; url: string }> = [];
  try {
    for (const image of images) {
      const uploadedImage = await uploadFeedbackImage(uid, input.orderId, image);
      uploaded.push(uploadedImage);
    }

    const subscriptionDeliveryId = String(order.subscriptionDeliveryId ?? '') || undefined;
    const ref = doc(db, 'orderFeedback', subscriptionDeliveryId ? `${input.orderId}_${subscriptionDeliveryId}` : input.orderId);
    await setDoc(ref, stripUndefined({
      customerId: mobile,
      authUid: uid,
      orderId: input.orderId,
      subscriptionDeliveryId,
      orderType: String(order.orderType ?? ''),
      productId: Array.isArray(order.items) && order.items.length === 1 ? String((order.items[0] as Record<string, unknown>).salableProductId ?? (order.items[0] as Record<string, unknown>).productId ?? '') || undefined : undefined,
      deliveryPartnerId: String(order.deliveryPartnerId ?? order.assignedDeliveryPartnerId ?? '') || undefined,
      orderRating: input.rating,
      deliveryRating: input.rating,
      comment,
      orderFeedbackOptions: positiveFeedback,
      deliveryFeedbackOptions: deliveryPartnerFeedback,
      images: uploaded.map((item) => item.url),
      status: 'new',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
    return { id: ref.id };
  } catch (error) {
    await Promise.all(uploaded.map(async (item) => {
      try { await deleteObject(ref(storage, item.path)); } catch { /* best-effort orphan cleanup */ }
    }));
    throw error;
  }
}

export async function updateCustomerFeedback(id: string, input: Pick<CreateCustomerFeedbackInput, 'rating' | 'comment' | 'positiveFeedback' | 'deliveryPartnerFeedback'>) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Customer session not found. Please log in again.');
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new Error('Please select a rating from 1 to 5.');
  const comment = clean(input.comment);
  if (comment && comment.length > 1000) throw new Error('Feedback must be 1000 characters or fewer.');
  const ref = doc(db, 'orderFeedback', id);
  const current = await getDoc(ref);
  if (!current.exists()) throw new Error('Feedback could not be found.');
  const data = current.data() as Record<string, unknown>;
  if (String(data.authUid ?? '') !== uid) throw new Error('You are not allowed to update this feedback.');
  await updateDoc(ref, stripUndefined({
    orderRating: input.rating,
    deliveryRating: input.rating,
    comment,
    orderFeedbackOptions: input.positiveFeedback ?? [],
    deliveryFeedbackOptions: input.deliveryPartnerFeedback ?? [],
    updatedAt: serverTimestamp(),
  }));
}

async function uploadFeedbackImage(uid: string, orderId: string, image: FeedbackImage) {
  const extension = image.mimeType === 'image/png' ? 'png' : 'jpg';
  const path = `orderFeedback/${uid}/${orderId}/${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${extension}`;
  const reference = ref(storage, path);
  const blob = await localUriToBlob(image.uri);
  await uploadBytes(reference, blob, { contentType: image.mimeType === 'image/png' ? 'image/png' : 'image/jpeg' });
  return { path, url: await getDownloadURL(reference) };
}


async function localUriToBlob(localUri: string): Promise<Blob> {
  const response = await fetch(localUri);
  if (!response.ok) throw new Error('Unable to read the selected photo.');
  return response.blob();
}

function validateImage(image: FeedbackImage) {
  if (!image.uri) throw new Error('One of the selected photos is invalid.');
  const mimeType = String(image.mimeType ?? '').toLowerCase();
  const fileName = String(image.fileName ?? '').toLowerCase();
  const validType = FEEDBACK_ALLOWED_IMAGE_TYPES.includes(mimeType as typeof FEEDBACK_ALLOWED_IMAGE_TYPES[number]) || /\.(png|jpe?g)$/.test(fileName);
  if (!validType) throw new Error('Only PNG and JPG/JPEG photos are allowed.');
  if (typeof image.fileSize === 'number' && image.fileSize > FEEDBACK_MAX_IMAGE_BYTES) throw new Error('Each feedback photo must be 5 MB or smaller.');
}

function timestampMillis(value: unknown) {
  if (value && typeof value === 'object' && 'toMillis' in value && typeof (value as { toMillis?: unknown }).toMillis === 'function') return (value as { toMillis: () => number }).toMillis();
  if (typeof value === 'string') return Date.parse(value) || 0;
  if (typeof value === 'number') return value;
  return 0;
}

function feedbackFromDoc(item: { id: string; data: () => Record<string, unknown> }): CustomerFeedback {
  const data = item.data() || {};
  const orderRating = Number(data.orderRating ?? data.rating ?? 0);
  const deliveryRating = Number(data.deliveryRating ?? orderRating);
  return {
    id: item.id,
    ...(data as Omit<CustomerFeedback, 'id' | 'rating'>),
    rating: orderRating,
    ...(orderRating ? { orderRating } : {}),
    ...(deliveryRating ? { deliveryRating } : {}),
    positiveFeedback: Array.isArray(data.orderFeedbackOptions) ? data.orderFeedbackOptions as FeedbackLikeKey[] : data.positiveFeedback as FeedbackLikeKey[] | undefined,
    deliveryPartnerFeedback: Array.isArray(data.deliveryFeedbackOptions) ? data.deliveryFeedbackOptions as DeliveryPartnerFeedbackKey[] : data.deliveryPartnerFeedback as DeliveryPartnerFeedbackKey[] | undefined,
  };
}
