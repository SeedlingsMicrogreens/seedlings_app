export function checkoutDocumentId(paymentAttemptId: string, kind: string, suffix: string) {
  const safeAttemptId = paymentAttemptId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeSuffix = suffix.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `checkout_${safeAttemptId}_${kind}_${safeSuffix}`;
}

export function checkoutOrderNumber(paymentAttemptId: string, index: number) {
  return `ORD-${paymentAttemptId.replace(/[^a-zA-Z0-9]/gi, '').slice(-12).toUpperCase()}-${String(index + 1).padStart(3, '0')}`;
}

export function checkoutSubscriptionNumber(paymentAttemptId: string, index: number) {
  return `SUB-${paymentAttemptId.replace(/[^a-zA-Z0-9]/gi, '').slice(-12).toUpperCase()}-${String(index + 1).padStart(3, '0')}`;
}

export function createCheckoutAttemptId(authUid: string, checkoutFingerprint: string) {
  const source = `${authUid}:${checkoutFingerprint}`;
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < source.length; index += 1) {
    const character = source.charCodeAt(index);
    first = Math.imul(first ^ character, 0x01000193);
    second = Math.imul(second ^ character, 0x85ebca6b);
  }
  return `pay-${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

export function unserviceablePincodeEnquiryId(authUid: string, pincode: string, addressId: string) {
  const safeAuthUid = authUid.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeAddressId = addressId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  return `pincode_${safeAuthUid}_${pincode}_${safeAddressId}`;
}

export function declinedAvailabilityEnquiryId(
  authUid: string,
  checkoutFingerprint: string,
  itemKey: string,
  requestedDate: string,
  resolvedDate: string,
) {
  return `availability_${createCheckoutAttemptId(authUid, [
    checkoutFingerprint,
    'declined-availability',
    itemKey,
    requestedDate,
    resolvedDate,
  ].join(':')).slice(4)}`;
}

export function buildCheckoutFingerprint(input: {
  addressId: string;
  deliverySlot: string;
  oneTimeItems: Array<{ id: string; quantity: number; sellingOptionId?: string; selectedWeight?: string; deliveryDate?: string; price: number }>;
  subscriptionItems: Array<{ id: string; planId: string; quantity: number; sellingOptionId?: string; selectedWeight?: string; startDate?: string; deliveryDate?: string; price: number }>;
}) {
  const oneTimeItems = input.oneTimeItems.map((item) => [
    item.id, item.quantity, item.sellingOptionId || '', item.selectedWeight || '', item.deliveryDate || '', item.price,
  ]).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const subscriptionItems = input.subscriptionItems.map((item) => [
    item.id, item.planId, item.quantity, item.sellingOptionId || '', item.selectedWeight || '',
    item.startDate || '', item.deliveryDate || '', item.price,
  ]).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return JSON.stringify({
    addressId: input.addressId,
    deliverySlot: input.deliverySlot,
    oneTimeItems,
    subscriptionItems,
  });
}
