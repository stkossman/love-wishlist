import { HttpError } from '@/lib/server/http';
import { WishlistMediaRepository } from './wishlist-media.repository';
import { imageVersion } from './wishlist-image-version';
import { mapImageMetadata } from './utils/image';
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
    if (!data.imagePublicId) {
      const ref = await getDatabase()
        .collection(COLLECTION_NAME)
        .add({ ...data, createdAt: FieldValue.serverTimestamp() });
      return ref.id;
    }
    const publicId = data.imagePublicId;
    const ref = getDatabase().collection(COLLECTION_NAME).doc();
    return getDatabase().runTransaction(async (transaction) => {
      const record = await WishlistMediaRepository.attachment(transaction, publicId);
      if (data.imageUrl !== record.image.secureUrl)
        throw new HttpError(409, 'Image does not match its upload');
      const payload = { ...data, ...mapImageMetadata(record.image) };
      if (record.state === 'attached') {
        if (typeof record.itemId !== 'string') throw new HttpError(409, 'Image is already in use');
        const saved = await transaction.get(
          getDatabase().collection(COLLECTION_NAME).doc(record.itemId)
        );
        if (saved.exists && this.matchesUpdate(saved.data() ?? {}, payload)) return saved.id;
        throw new HttpError(409, 'Image was already saved. Refresh the wishlist before retrying.');
      }
      transaction.create(ref, { ...payload, createdAt: FieldValue.serverTimestamp() });
      WishlistMediaRepository.attach(transaction, publicId, ref.id);
      return ref.id;
    });
  }

  private static matchesUpdate(current: Record<string, unknown>, data: UpdateItemDTO): boolean {
    return Object.entries(data).every(([key, value]) =>
      value === null && IMAGE_FIELD_KEYS.some((field) => field === key)
        ? current[key] == null
        : JSON.stringify(current[key]) === JSON.stringify(value)
    );
  }

  static async replaceImage(
    id: string,
    data: UpdateItemDTO,
    expectedVersion?: string
  ): Promise<{ cleanupImageId: string | null } | null> {
    if (!expectedVersion)
      throw new HttpError(428, 'Refresh the edit page before changing the image');
    const ref = getDatabase().collection(COLLECTION_NAME).doc(id);
    return getDatabase().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const current = snapshot.data();
      if (!current) return null;
      if (imageVersion(current) !== expectedVersion) {
        if (this.matchesUpdate(current, data)) return { cleanupImageId: null };
        throw new HttpError(409, 'The image changed in another request. Refresh the edit page.');
      }
      const newId = typeof data.imagePublicId === 'string' ? data.imagePublicId : null;
      const image = newId ? await WishlistMediaRepository.attachment(transaction, newId) : null;
      if (
        image &&
        (data.imageUrl !== image.image.secureUrl ||
          (image.state === 'attached' && image.itemId !== id))
      ) {
        throw new HttpError(409, 'Image is already in use or does not match its upload');
      }
      const cleanupImageId =
        current.imagePublicId !== newId
          ? await WishlistMediaRepository.retirement(transaction, current.imagePublicId, id)
          : null;
      const update: DocumentData = image
        ? { ...data, ...mapImageMetadata(image.image) }
        : { ...data };
      if (!newId) for (const key of IMAGE_FIELD_KEYS) update[key] = FieldValue.delete();
      transaction.update(ref, update);
      if (newId) WishlistMediaRepository.attach(transaction, newId, id);
      if (cleanupImageId) WishlistMediaRepository.retire(transaction, cleanupImageId);
      return { cleanupImageId };
    });
  }

  static async update(id: string, data: UpdateItemDTO): Promise<boolean> {
    if (IMAGE_FIELD_KEYS.some((key) => Object.hasOwn(data, key))) {
      throw new Error('Image updates require the transactional media path');
    }
    const updateData: DocumentData = { ...data };
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

  static async delete(
    id: string
  ): Promise<{ item: WishlistItem; cleanupImageId: string | null } | null> {
    const ref = getDatabase().collection(COLLECTION_NAME).doc(id);
    return getDatabase().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const data = snapshot.data();
      if (!data) return null;
      const item = this.toItem(snapshot.id, data);
      const cleanupImageId = await WishlistMediaRepository.retirement(
        transaction,
        data.imagePublicId,
        id
      );
      transaction.delete(ref);
      if (cleanupImageId) WishlistMediaRepository.retire(transaction, cleanupImageId);
      return { item, cleanupImageId };
    });
  }
}
