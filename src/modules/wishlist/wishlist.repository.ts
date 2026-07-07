import { db } from '@/lib/firebase';
import {
  collection,
  addDoc,
  deleteDoc,
  deleteField,
  updateDoc,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  Timestamp,
  type DocumentData,
  type QueryConstraint,
  type UpdateData,
} from 'firebase/firestore';
import type {
  CreateItemDTO,
  Owner,
  UpdateItemDTO,
  WishlistImageFields,
  WishlistItem,
} from './wishlist.types';

const COLLECTION_NAME = 'items';
const IMAGE_FIELD_KEYS = [
  'imageUrl',
  'imagePublicId',
  'imageWidth',
  'imageHeight',
  'imageFormat',
  'imageBytes',
] as const satisfies readonly (keyof WishlistImageFields)[];

export class WishlistRepository {
  static async findAll(owner?: Owner, cursorStr?: string, pageSize = 6) {
    const itemsCollection = collection(db, COLLECTION_NAME);
    const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc'), limit(pageSize)];

    if (owner) constraints.unshift(where('owner', '==', owner));

    if (cursorStr) {
      const date = new Date(cursorStr);
      constraints.push(startAfter(Timestamp.fromDate(date)));
    }

    const finalQuery = query(itemsCollection, ...constraints);
    const snapshot = await getDocs(finalQuery);

    const items = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate().toISOString(),
      } as WishlistItem;
    });

    const nextCursor = items.length === pageSize ? items[items.length - 1].createdAt : null;

    return { items, nextCursor };
  }

  static async findById(id: string): Promise<WishlistItem | null> {
    const docRef = doc(db, COLLECTION_NAME, id);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) return null;

    const data = snapshot.data();
    return {
      id: snapshot.id,
      ...data,
      createdAt: data.createdAt?.toDate().toISOString(),
    } as WishlistItem;
  }

  static async create(data: CreateItemDTO) {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  }

  static async update(id: string, data: UpdateItemDTO) {
    const docRef = doc(db, COLLECTION_NAME, id);
    const updateData: UpdateData<DocumentData> = { ...data };

    IMAGE_FIELD_KEYS.forEach((field) => {
      if (data[field] === null) {
        updateData[field] = deleteField();
      }
    });

    await updateDoc(docRef, updateData);
  }

  static async delete(id: string) {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  }
}
