import { getDatabase } from '@/lib/server/firebase';
import { FieldValue, Timestamp, type Query, type DocumentData } from 'firebase-admin/firestore';
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
    let query: Query = getDatabase().collection(COLLECTION_NAME).orderBy('createdAt', 'desc');
    if (owner) query = query.where('owner', '==', owner);
    if (cursorStr) query = query.startAfter(Timestamp.fromDate(new Date(cursorStr)));
    const snapshot = await query.limit(pageSize).get();
    const items = snapshot.docs.map((doc) => this.toItem(doc.id, doc.data()));
    const nextCursor = items.length === pageSize ? items[items.length - 1].createdAt : null;
    return { items, nextCursor };
  }

  private static toItem(id: string, data: DocumentData): WishlistItem {
    return { ...data, id, createdAt: data.createdAt?.toDate().toISOString() } as WishlistItem;
  }

  static async findById(id: string): Promise<WishlistItem | null> {
    const snapshot = await getDatabase().collection(COLLECTION_NAME).doc(id).get();
    const data = snapshot.data();
    return data ? this.toItem(snapshot.id, data) : null;
  }

  static async create(data: CreateItemDTO) {
    const docRef = await getDatabase()
      .collection(COLLECTION_NAME)
      .add({ ...data, createdAt: FieldValue.serverTimestamp() });
    return docRef.id;
  }

  static async update(id: string, data: UpdateItemDTO) {
    const updateData: DocumentData = { ...data };
    for (const field of IMAGE_FIELD_KEYS) {
      if (data[field] === null) updateData[field] = FieldValue.delete();
    }
    await getDatabase().collection(COLLECTION_NAME).doc(id).update(updateData);
  }

  static async delete(id: string) {
    await getDatabase().collection(COLLECTION_NAME).doc(id).delete();
  }
}
