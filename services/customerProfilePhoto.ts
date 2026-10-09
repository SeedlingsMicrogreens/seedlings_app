import { getDownloadURL, ref, uploadBytes, deleteObject } from 'firebase/storage';
import { auth } from './core/firebaseClient.native';
import { storage, db } from './core/firebaseClient';
import { normalizeIndianMobile } from './clientOnboarding';
import { getCachedCustomer, setCachedCustomer } from './customerCache';
import { doc, updateDoc, serverTimestamp } from './core/firestore';

function customerRef(mobile: string) {
  const normalized = normalizeIndianMobile(mobile);
  if (!normalized) throw new Error('Invalid customer mobile number.');
  return doc(db, 'customers', normalized);
}

function requireUid() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Your session has expired. Please sign in again.');
  return uid;
}

async function localUriToBlob(localUri: string): Promise<Blob> {
  const response = await fetch(localUri);
  if (!response.ok) throw new Error('Unable to read the selected photo.');
  return response.blob();
}

export async function uploadCustomerProfilePhoto(mobile: string, localUri: string): Promise<string> {
  const uid = requireUid();
  if (!localUri) throw new Error('Please select a profile photo.');

  const blob = await localUriToBlob(localUri);
  const photoRef = ref(storage, `customer-profile/${uid}/profile.jpg`);
  await uploadBytes(photoRef, blob, { contentType: blob.type || 'image/jpeg' });
  const photoUrl = await getDownloadURL(photoRef);
  await updateDoc(customerRef(mobile), { profilePhotoUrl: photoUrl, photoUrl, updatedAt: serverTimestamp() });
  const normalized = normalizeIndianMobile(mobile);
  if (normalized) {
    const cached = getCachedCustomer(normalized);
    setCachedCustomer(normalized, { ...(cached ?? { mobile: normalized }), profilePhotoUrl: photoUrl, photoUrl });
  }
  return photoUrl;
}

export async function removeCustomerProfilePhoto(mobile: string): Promise<void> {
  const uid = requireUid();
  const photoRef = ref(storage, `customer-profile/${uid}/profile.jpg`);
  try {
    await deleteObject(photoRef);
  } catch (error: any) {
    if (error?.code !== 'storage/object-not-found') throw error;
  }
  await updateDoc(customerRef(mobile), { profilePhotoUrl: null, photoUrl: null, updatedAt: serverTimestamp() });
  const normalized = normalizeIndianMobile(mobile);
  if (normalized) {
    const cached = getCachedCustomer(normalized);
    setCachedCustomer(normalized, { ...(cached ?? { mobile: normalized }), profilePhotoUrl: undefined, photoUrl: undefined });
  }
}
