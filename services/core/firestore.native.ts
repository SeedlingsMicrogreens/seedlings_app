import { FieldValue, getFirestore as getNativeFirestore } from '@react-native-firebase/firestore';

export const getFirestore = (db?: any) => db ?? getNativeFirestore();


export const collection = (db: any, path: string) => db.collection(path);

export function doc(dbOrCollection: any, pathOrId?: string, id?: string) {
  if (id !== undefined) return dbOrCollection.collection(pathOrId).doc(id);
  if (typeof pathOrId === 'string') return dbOrCollection.doc(pathOrId);
  return dbOrCollection.doc();
}

const wrapDoc = (snapshot: any) => ({
  id: snapshot.id,
  exists: () => snapshot.exists,
  data: () => snapshot.data(),
});

export async function getDoc(ref: any) {
  return wrapDoc(await ref.get());
}

export async function getDocs(ref: any) {
  const snapshot = await ref.get();
  return { docs: snapshot.docs.map(wrapDoc) };
}

export function where(field: string, op: any, value: unknown) {
  return { kind: 'where', field, op, value };
}

export function orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
  return { kind: 'orderBy', field, direction };
}

export function query(ref: any, ...constraints: any[]) {
  return constraints.reduce((current, constraint) => {
    if (constraint.kind === 'where') return current.where(constraint.field, constraint.op, constraint.value);
    if (constraint.kind === 'orderBy') return current.orderBy(constraint.field, constraint.direction);
    return current;
  }, ref);
}

export async function addDoc(ref: any, data: Record<string, unknown>) {
  const result = await ref.add(data);
  return { id: result.id };
}

export async function updateDoc(ref: any, data: Record<string, unknown>) {
  await ref.update(data);
}

export async function setDoc(ref: any, data: Record<string, unknown>, options?: { merge?: boolean }) {
  await ref.set(data, options);
}

export function writeBatch(db: any) {
  return db.batch();
}

export function serverTimestamp() {
  return FieldValue.serverTimestamp();
}


export function onSnapshot(ref: any, onNext: (snapshot: any) => void, onError?: (error: Error) => void) {
  return ref.onSnapshot(
    (snapshot: any) => onNext({ docs: snapshot.docs.map(wrapDoc) }),
    onError,
  );
}
