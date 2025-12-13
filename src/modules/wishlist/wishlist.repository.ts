import { db } from '@/lib/firebase';
import {
  collection,
  addDoc,
  deleteDoc,
  updateDoc,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import type { CreateItemDTO, UpdateItemDTO, WishlistItem } from './wishlist.types';

const COLLECTION_NAME = 'items';

export class WishlistRepository {
  static async findAll(owner?: string, cursorStr?: string, pageSize = 6) {
    let q = collection(db, COLLECTION_NAME);
    const constraints: any[] = [orderBy('createdAt', 'desc'), limit(pageSize)];

    if (owner) constraints.unshift(where('owner', '==', owner));

    if (cursorStr) {
      const date = new Date(cursorStr);
      constraints.push(startAfter(Timestamp.fromDate(date)));
    }

    // @ts-ignore
    const finalQuery = query(q, ...constraints);
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

  static async create(data: CreateItemDTO) {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  }

  static async update(id: string, data: UpdateItemDTO) {
    const docRef = doc(db, COLLECTION_NAME, id);
    await updateDoc(docRef, data as any);
  }

  static async delete(id: string) {
    const docRef = doc(db, COLLECTION_NAME, id);
    await deleteDoc(docRef);
  }
}
