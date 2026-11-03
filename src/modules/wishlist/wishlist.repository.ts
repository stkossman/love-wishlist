import { getDatabase } from '@/lib/server/firebase';
import {
  FieldPath,
  FieldValue,
  Timestamp,
  type Query,
  type DocumentData,
} from 'firebase-admin/firestore';
import { decodeCursor, encodeCursor } from './wishlist.cursor';
import { isOwner, getSafeHttpUrl } from './wishlist.utils';
import type {
  CreateItemDTO,
  Owner,
  UpdateItemDTO,
  WishlistImageFields,
  WishlistItem,
  WishlistPage,
} from './wishlist.types';

const COLLECTION_NAME = 'items';
const PAGE_SIZE = 6;
const FIRESTORE_NOT_FOUND = 5;
const IMAGE_FIELD_KEYS = [
  'imageUrl',
  'imagePublicId',
  'imageWidth',
  'imageHeight',
  'imageFormat',
  'imageBytes',
] as const satisfies readonly (keyof WishlistImageFields)[];

export class WishlistRepository {
  static async findAll(owner?: Owner, cursorStr?: string): Promise<WishlistPage> {
    const cursor = cursorStr === undefined ? undefined : decodeCursor(cursorStr, owner);
    let query: Query = getDatabase()
      .collection(COLLECTION_NAME)
      .orderBy('createdAt', 'desc')
      .orderBy(FieldPath.documentId(), 'desc');
    if (owner) query = query.where('owner', '==', owner);
    if (cursor) query = query.startAfter(cursor.timestamp, cursor.id);
    const snapshot = await query.limit(PAGE_SIZE).get();
    const items = snapshot.docs.map((doc) => this.toItem(doc.id, doc.data()));
    const last = snapshot.docs.at(-1);
    let nextCursor: string | null = null;
    if (snapshot.docs.length === PAGE_SIZE && last) {
      const timestamp: unknown = last.data().createdAt;
      if (!(timestamp instanceof Timestamp)) throw new Error('Invalid stored pagination timestamp');
      nextCursor = encodeCursor(timestamp, last.id, owner);
    }
    return { items, nextCursor };
  }

  private static toItem(id: string, data: Record<string, unknown>): WishlistItem {
    if (!isOwner(data.owner)) throw new Error('Invalid stored wishlist owner');
    const string = (value: unknown) => (typeof value === 'string' ? value : undefined);
    const positiveInteger = (value: unknown) =>
      typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
    const date =
      data.createdAt instanceof Timestamp
        ? data.createdAt.toDate()
        : data.createdAt instanceof Date
          ? data.createdAt
          : typeof data.createdAt === 'string'
            ? new Date(data.createdAt)
            : null;
    const item: WishlistItem = {
      id,
      owner: data.owner,
      topic: string(data.topic) ?? '',
      name: string(data.name) || 'Untitled item',
      createdAt: date && Number.isFinite(date.getTime()) ? date.toISOString() : '',
    };
    for (const field of ['price', 'description', 'imagePublicId', 'imageFormat'] as const) {
      const value = string(data[field]);
      if (value !== undefined) item[field] = value;
    }
    for (const field of ['url', 'imageUrl'] as const) {
      const value = getSafeHttpUrl(string(data[field]));
      if (value) item[field] = value;
    }
    for (const field of ['imageWidth', 'imageHeight', 'imageBytes'] as const) {
      const value = positiveInteger(data[field]);
      if (value !== undefined) item[field] = value;
    }
    if (Array.isArray(data.specs)) {
      item.specs = data.specs.flatMap((spec: unknown) => {
        if (
          !spec ||
          typeof spec !== 'object' ||
          !('label' in spec) ||
          !('value' in spec) ||
          typeof spec.label !== 'string' ||
          typeof spec.value !== 'string'
        )
          return [];
        return [{ label: spec.label, value: spec.value }];
      });
    }
    return item;
  }

  static async findById(id: string): Promise<WishlistItem | null> {
    const snapshot = await getDatabase().collection(COLLECTION_NAME).doc(id).get();
    const data = snapshot.data();
    return data ? this.toItem(snapshot.id, data) : null;
  }

  static async create(data: CreateItemDTO): Promise<string> {
    const docRef = await getDatabase()
      .collection(COLLECTION_NAME)
      .add({ ...data, createdAt: FieldValue.serverTimestamp() });
    return docRef.id;
  }

  static async update(id: string, data: UpdateItemDTO): Promise<boolean> {
    const updateData: DocumentData = { ...data };
    for (const field of IMAGE_FIELD_KEYS) {
      if (data[field] === null) updateData[field] = FieldValue.delete();
    }
    try {
      await getDatabase().collection(COLLECTION_NAME).doc(id).update(updateData);
      return true;
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === FIRESTORE_NOT_FOUND
      )
        return false;
      throw error;
    }
  }

  static async delete(id: string): Promise<void> {
    await getDatabase().collection(COLLECTION_NAME).doc(id).delete();
  }
}
